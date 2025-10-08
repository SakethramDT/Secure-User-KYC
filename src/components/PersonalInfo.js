// PersonalInfo.js
import React, { useState, useEffect } from "react";
import {
  FaUser,
  FaEnvelope,
  FaCalendarAlt,
  FaVenusMars,
  FaGlobe,
  FaIdCard,
  FaChevronDown,
} from "react-icons/fa";
import "./PersonalInfo.css";

const LABELS = {
  name: "full name",
  email: "email",
  date_of_birth: "date of birth",
  gender: "gender",
  nationality: "nationality",
  user_id: "ID number",
  id_issue_date: "ID issue date",
  id_expiry_date: "ID expiry date",
};

const REQUIRED_FIELDS = [
  "name",
  "email",
  "date_of_birth",
  "gender",
  "nationality",
  "user_id",
  "id_issue_date",
  "id_expiry_date",
];

const PersonalInfo = ({ formData, setFormData, onNext, username }) => {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!formData || Object.keys(formData).length === 0) {
      const savedData = localStorage.getItem("kycFormData");
      if (savedData) {
        setFormData(JSON.parse(savedData));
      } else if (username) {
        setFormData((prev) => ({ ...prev, username }));
      }
    }
  }, [username, setFormData, formData]);

  const clearFieldError = (name) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleChange = (e) => {
    setTouched(true);
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      const personalInfo = { ...updated };
      delete personalInfo.document_front;
      delete personalInfo.document_back;
      localStorage.setItem("kycFormData", JSON.stringify(personalInfo));
      return updated;
    });

    if (String(value).trim() !== "") clearFieldError(name);
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (REQUIRED_FIELDS.includes(name) && String(value).trim() === "") {
      setErrors((prev) => ({
        ...prev,
        [name]: `Please fill in ${LABELS[name] || name.replace(/_/g, " ")}`,
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    REQUIRED_FIELDS.forEach((field) => {
      const v = formData[field];
      if (v === undefined || v === null || String(v).trim() === "") {
        newErrors[field] = `Please fill in ${
          LABELS[field] || field.replace(/_/g, " ")
        }`;
      }
    });

    if (
      formData.email &&
      String(formData.email).trim() !== "" &&
      !/^\S+@\S+\.\S+$/.test(formData.email)
    ) {
      newErrors.email = "Please enter a valid email";
    }

    if (formData.date_of_birth) {
      const dob = new Date(formData.date_of_birth);
      if (!isNaN(dob) && dob >= today) {
        newErrors.date_of_birth = "Date of Birth must be before today";
      }
    }

    if (formData.id_issue_date) {
      const issueDate = new Date(formData.id_issue_date);
      if (!isNaN(issueDate) && issueDate >= today) {
        newErrors.id_issue_date = "Issue Date must be before today";
      }
    }

    if (formData.id_expiry_date) {
      const expiryDate = new Date(formData.id_expiry_date);
      if (!isNaN(expiryDate) && expiryDate <= today) {
        newErrors.id_expiry_date = "Expiry Date must be after today";
      }
    }

    if (formData.id_issue_date && formData.id_expiry_date) {
      const issueDate = new Date(formData.id_issue_date);
      const expiryDate = new Date(formData.id_expiry_date);
      if (!isNaN(issueDate) && !isNaN(expiryDate) && issueDate >= expiryDate) {
        newErrors.id_issue_date = "Issue Date must be before Expiry Date";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      const firstError = document.querySelector(".error-message");
      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (!formData.username) {
      alert("System error: Missing username. Please restart.");
      return;
    }

    onNext(formData);
  };

  const hasRequiredEmpty = REQUIRED_FIELDS.some(
    (f) => !formData[f] || String(formData[f]).trim() === ""
  );
  const isDisabled =
    touched && (hasRequiredEmpty || Object.keys(errors).length > 0);

  return (
    <div className="personal-info-container">
      <div className="personal-info-header">
        <h2>Personal Information</h2>
        <p>Please provide your personal details to begin verification</p>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Full Name</label>
          <div className="input-with-icon">
            <FaUser className="react-icon" />
            <input
              name="name"
              value={formData.name || ""}
              placeholder="Enter your full name"
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>
          {errors.name && <span className="error-message">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label>Email Address</label>
          <div className="input-with-icon">
            <FaEnvelope className="react-icon" />
            <input
              name="email"
              value={formData.email || ""}
              placeholder="Enter your email"
              onChange={handleChange}
              onBlur={handleBlur}
              type="email"
              required
            />
          </div>
          {errors.email && (
            <span className="error-message">{errors.email}</span>
          )}
        </div>

        <div className="form-group">
          <label>Date of Birth</label>
          <div className="input-with-icon">
            <FaCalendarAlt className="react-icon" />
            <input
              name="date_of_birth"
              type="date"
              value={formData.date_of_birth || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>
          {errors.date_of_birth && (
            <span className="error-message">{errors.date_of_birth}</span>
          )}
        </div>

        <div className="form-group">
          <label>Gender</label>
          <div className="input-with-icon">
            <FaVenusMars className="react-icon" />
            <select
              name="gender"
              value={formData.gender || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              required
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            <FaChevronDown className="dropdown-icon" />
          </div>
          {errors.gender && (
            <span className="error-message">{errors.gender}</span>
          )}
        </div>

        <div className="form-group">
          <label>Nationality</label>
          <div className="input-with-icon">
            <FaGlobe className="react-icon" />
            <input
              name="nationality"
              value={formData.nationality || ""}
              placeholder="Enter your nationality"
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>
          {errors.nationality && (
            <span className="error-message">{errors.nationality}</span>
          )}
        </div>

        <div className="form-group">
          <label>ID Number</label>
          <div className="input-with-icon">
            <FaIdCard className="react-icon" />
            <input
              name="user_id"
              value={formData.user_id || ""}
              placeholder="Enter your ID number"
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>
          {errors.user_id && (
            <span className="error-message">{errors.user_id}</span>
          )}
        </div>

        <div className="form-group">
          <label>ID Issue Date</label>
          <div className="input-with-icon">
            <FaCalendarAlt className="react-icon" />
            <input
              name="id_issue_date"
              type="date"
              value={formData.id_issue_date || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>
          {errors.id_issue_date && (
            <span className="error-message">{errors.id_issue_date}</span>
          )}
        </div>

        <div className="form-group">
          <label>ID Expiry Date</label>
          <div className="input-with-icon">
            <FaCalendarAlt className="react-icon" />
            <input
              name="id_expiry_date"
              type="date"
              value={formData.id_expiry_date || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>
          {errors.id_expiry_date && (
            <span className="error-message">{errors.id_expiry_date}</span>
          )}
        </div>
      </div>

      <button
        className="continue-btn"
        onClick={handleSubmit}
        disabled={
          touched &&
          (Object.keys(errors).length > 0 ||
            REQUIRED_FIELDS.some(
              (f) => !formData[f] || String(formData[f]).trim() === ""
            ))
        }
      >
        Continue to Document Upload
      </button>
    </div>
  );
};

export default PersonalInfo;
