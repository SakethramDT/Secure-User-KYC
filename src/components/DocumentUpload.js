// DocumentUpload.js
import React, { useState, useEffect, useRef } from "react";
import "./DocumentUpload.css";

const STORAGE_KEY = "kyc_formdata";

/** strip large fields before storing in localStorage */
const makeSafeDraft = (obj = {}) => {
  const copy = { ...(obj || {}) };
  delete copy.document_front;
  delete copy.document_back;
  delete copy.document_front_base64;
  delete copy.document_back_base64;
  if (Array.isArray(copy.documents)) {
    copy.documents = copy.documents.map((d) => {
      if (!d || typeof d !== "object") return d;
      const shallow = { ...d };
      if (shallow.base64) delete shallow.base64;
      return shallow;
    });
  }
  return copy;
};

const safeSetLocalStorage = (key, obj) => {
  try {
    localStorage.setItem(key, JSON.stringify(makeSafeDraft(obj)));
    return true;
  } catch (e) {
    console.warn("localStorage persist failed (ignored):", e);
    return false;
  }
};

const DocumentUpload = ({ formData = {}, setFormData, onNext, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  useEffect(() => {
    // Clear any stale error if username is missing (session expired)
    if (!formData?.username) setError(null);
  }, [formData]);

  // Helper: read File -> dataURL (base64)
  const readFileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // data:<mime>;base64,...
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });

  const handleFileChange = (field, e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(null);
    if (typeof setFormData === "function") {
      setFormData((prev) => {
        const updated = { ...(prev || {}), [field]: file };
        // persist a safe draft (exclude actual File object and base64)
        safeSetLocalStorage(STORAGE_KEY, updated);
        return updated;
      });
    }
  };

  const removeFile = (field, inputRef) => {
    if (typeof setFormData === "function") {
      setFormData((prev) => {
        const updated = { ...(prev || {}) };
        updated[field] = null;
        // remove base64 fallback if present
        if (field === "document_front") {
          delete updated.document_front_base64;
          if (Array.isArray(updated.documents)) updated.documents = updated.documents.filter(d => d.type !== "front");
        }
        if (field === "document_back") {
          delete updated.document_back_base64;
          if (Array.isArray(updated.documents)) updated.documents = updated.documents.filter(d => d.type !== "back");
        }
        safeSetLocalStorage(STORAGE_KEY, updated);
        return updated;
      });
    }
    if (inputRef?.current) inputRef.current.value = "";
  };

  const validateFile = (file) => {
    if (!file) return "File is required";
    if (file.size > 10 * 1024 * 1024) return "File is too large (max 10MB)";
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!validTypes.includes(file.type)) return "Invalid file type. Use JPG, PNG, or PDF";
    return null;
  };

  const handleSubmit = async () => {
    if (!formData?.username) {
      setError("Session expired. Please login again.");
      return;
    }

    const frontError = validateFile(formData.document_front || (formData.document_front_base64 ? { size: 1, type: "image/jpeg" } : null));
    const backError = validateFile(formData.document_back || (formData.document_back_base64 ? { size: 1, type: "image/jpeg" } : null));

    if (frontError || backError) {
      setError(frontError || backError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const prev = (formData || {});

      // Read files to base64 only if file object present and base64 absent
      let frontBase64 = prev.document_front_base64 || null;
      let backBase64 = prev.document_back_base64 || null;

      if (prev.document_front instanceof File && !frontBase64) {
        frontBase64 = await readFileToBase64(prev.document_front);
      }
      if (prev.document_back instanceof File && !backBase64) {
        backBase64 = await readFileToBase64(prev.document_back);
      }

      // Build documents array preserving existing non-front/back docs
      const existingDocs = Array.isArray(prev.documents) ? prev.documents.filter(d => d.type !== "front" && d.type !== "back") : [];
      if (frontBase64) existingDocs.push({ type: "front", base64: frontBase64 });
      if (backBase64) existingDocs.push({ type: "back", base64: backBase64 });

      const updated = {
        ...prev,
        documents: existingDocs,
      };

      if (frontBase64) updated.document_front_base64 = frontBase64;
      if (backBase64) updated.document_back_base64 = backBase64;

      // persist merged state to parent and localStorage (but store a safe draft)
      if (typeof setFormData === "function") setFormData(updated);
      safeSetLocalStorage(STORAGE_KEY, updated);

      // IMPORTANT: We intentionally DO NOT call /api/users here.
      // Final persistence will happen in /api/book on "Schedule".

      // Call onNext(updated) so parent advances to schedule step
      if (typeof onNext === "function") onNext(updated);
    } catch (err) {
      console.error("Document read/save error:", err);
      setError("Failed to read/save documents. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="document-upload-container">
      <div className="document-upload-header">
        <h2>Document Upload</h2>
        <p>Please upload clear photos of both sides of your government-issued ID</p>
      </div>

      <div className="upload-sections">
        {/* Front */}
        <div className="upload-section">
          <div className="dotted-box">
            {!formData?.document_front ? (
              <div className="upload-interface">
                <div className="upload-icon">
                  {/* svg */}
                  <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#c7a047" />
                  </svg>
                </div>
                <h3>Front of ID</h3>
                <p className="section-description">Upload the front side of your ID document</p>

                <div className="file-upload-area">
                  <input
                    id="document-front"
                    ref={frontInputRef}
                    type="file"
                    accept=".jpeg,.jpg,.png,.pdf"
                    onChange={(e) => handleFileChange("document_front", e)}
                    disabled={loading}
                  />
                  <label htmlFor="document-front" className="choose-file-button">Choose File</label>
                </div>
                <p className="upload-subtext">or drag and drop your image here</p>
              </div>
            ) : (
              <div className="file-details">
                <div className="upload-icon">
                  <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#c7a047" />
                  </svg>
                </div>
                <div className="file-info">
                  <h4>{formData.document_front?.name || "Selected file"}</h4>
                  <p>{formatFileSize(formData.document_front?.size)}</p>
                </div>
                <button className="remove-button" onClick={() => removeFile("document_front", frontInputRef)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Back */}
        <div className="upload-section">
          <div className="dotted-box">
            {!formData?.document_back ? (
              <div className="upload-interface">
                <div className="upload-icon">
                  <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#c7a047" />
                  </svg>
                </div>
                <h3>Back of ID</h3>
                <p className="section-description">Upload the back side of your ID document</p>

                <div className="file-upload-area">
                  <input
                    id="document-back"
                    ref={backInputRef}
                    type="file"
                    accept=".jpeg,.jpg,.png,.pdf"
                    onChange={(e) => handleFileChange("document_back", e)}
                    disabled={loading}
                  />
                  <label htmlFor="document-back" className="choose-file-button">Choose File</label>
                </div>
                <p className="upload-subtext">or drag and drop your image here</p>
              </div>
            ) : (
              <div className="file-details">
                <div className="upload-icon">
                  <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#c7a047" />
                  </svg>
                </div>
                <div className="file-info">
                  <h4>{formData.document_back?.name || "Selected file"}</h4>
                  <p>{formatFileSize(formData.document_back?.size)}</p>
                </div>
                <button className="remove-button" onClick={() => removeFile("document_back", backInputRef)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="requirements-section">
        <h3>Document Requirements:</h3>
        <ul>
          <li>Clear, high-resolution images</li>
          <li>All text must be clearly visible</li>
          <li>No glare or shadows</li>
          <li>Accepted formats: JPG, PNG, PDF</li>
          <li>Maximum file size: 10MB per document</li>
        </ul>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="navigation-buttons">
        <button className="back-button" onClick={onBack} disabled={loading}>
          Back
        </button>

        <button
          className="continue-button"
          onClick={handleSubmit}
          disabled={loading || (!formData?.document_front && !formData?.document_front_base64) || (!formData?.document_back && !formData?.document_back_base64)}
        >
          {loading ? "Processing..." : "Continue to Schedule"}
        </button>
      </div>
    </div>
  );
};

export default DocumentUpload;
