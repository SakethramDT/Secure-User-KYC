// import React, { useEffect, useState } from "react";

// const BASE_URL = process.env.REACT_APP_BACKEND_URL;

// const VerificationSummary = ({ username, onDone }) => {
//   console.log("VerificationSummary username:", username);
//   const [summary, setSummary] = useState(null);

//   useEffect(() => {
//     const fetchSummary = async () => {
//       try {
//         const res = await fetch(`${BASE_URL}/api/kyc-summary/${username}`);
//         if (!res.ok) {
//           throw new Error("Failed to fetch summary");
//         }
//         const data = await res.json();
//         setSummary(data);
//         console.log("Verification Summary:", data);
//       } catch (err) {
//         console.error("Failed to fetch verification summary:", err);
//       }
//     };
//     fetchSummary();
//   }, [username]);

//   if (!summary) {
//     return <p>Loading summary...</p>;
//   }

//   return (
//     <div className="step-content flex flex-col items-center">
//       <div className="bg-white shadow-lg rounded-2xl p-6 max-w-3xl w-full">
//         <h2 className="text-2xl font-bold mb-4">Details Summary</h2>

//         {/* Personal Details */}
//         <div className="mb-6">
//           <h3 className="text-lg font-semibold mb-2">Personal Details</h3>
//           <ul className="list-disc pl-6 text-gray-700">
//             <li>
//               <strong>Name:</strong> {summary["Full Name"]}
//             </li>
//             <li>
//               <strong>Name:</strong> {summary["Email"]}
//             </li>
//             <li>
//               <strong>Date of Birth:</strong> {summary["Date of Birth"]}
//             </li>
//             <li>
//               <strong>Gender:</strong> {summary["Gender"]}
//             </li>
//             <li>
//               <strong>Nationality:</strong> {summary["Nationality"]}
//             </li>
//             <li>
//               <strong>ID Number:</strong> {summary["ID Number"]}
//             </li>
//             <li>
//               <strong>ID Issue Date:</strong> {summary["ID Issue Date"]}
//             </li>
//             <li>
//               <strong>ID Expiry Date:</strong> {summary["ID Expiry Date"]}
//             </li>
//           </ul>
//         </div>

//         {/* Documents */}
//         <div className="mb-6">
//           <h3 className="text-lg font-semibold mb-2">Uploaded Documents</h3>
//           <div className="grid grid-cols-2 gap-4">
//             <div className="border rounded-lg p-2 shadow">
//               <p className="font-medium">Front</p>
//               <img
//                 src={summary["Document Front"]}
//                 alt="Front Document"
//                 className="mt-2 w-full h-40 object-cover rounded"
//               />
//             </div>
//             <div className="border rounded-lg p-2 shadow">
//               <p className="font-medium">Back</p>
//               <img
//                 src={summary["Document Back"]}
//                 alt="Back Document"
//                 className="mt-2 w-full h-40 object-cover rounded"
//               />
//             </div>
//           </div>
//         </div>

//         {/* Face Image */}
//         <div className="mb-6">
//           <h3 className="text-lg font-semibold mb-2">Face Capture</h3>
//           <img
//             src={summary["Face Image"]}
//             alt="Face Capture"
//             className="w-40 h-40 rounded-full object-cover border shadow"
//           />
//         </div>

//         {/* Done Button */}
//         <div className="flex justify-center mt-6">
//           <button
//             onClick={onDone}
//             className="bg-blue-600 text-white px-6 py-2 rounded-lg shadow hover:bg-blue-700 transition"
//           >
//             Done
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default VerificationSummary;

// VerificationSummary.js
import React, { useEffect, useState } from "react";
import "./VerificationSummary.css";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const VerificationSummary = ({ username, onDone }) => {
  console.log("VerificationSummary username:", username);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const personalInfo = localStorage.getItem("personalInfo");
    // if (!personalInfo && !username) {
    //   navigate("/"); // if no session, kick back to login
    //   return;
    // }

    const user =
      username ||
      (personalInfo ? JSON.parse(personalInfo)?.username || "" : "");

    if (!user) return;

    const fetchSummary = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/kyc-summary/${user}`);
        if (!res.ok) {
          throw new Error("Failed to fetch summary");
        }
        const data = await res.json();
        setSummary(data);
        console.log("Verification Summary:", data);
      } catch (err) {
        console.error("Failed to fetch verification summary:", err);
      }
    };
    fetchSummary();
  }, [username]);

  if (!summary) {
    return (
      <div className="verification-summary-container">
        <div className="loading-message">Loading summary...</div>
      </div>
    );
  }

  return (
    <div className="verification-summary-container">
      <div className="verification-success-card">
        <div className="verification-complete-section">
          <h2>Verification Details</h2>
          <p>
            Your account is under supervision, We will let you know the status
            through mail.Thank You.
          </p>
        </div>

        <div className="divider"></div>

        <div className="uploaded-documents">
          <h3>Uploaded Documents</h3>
          <div className="document-grid">
            <div className="document-item">
              <div className="document-image-container">
                <img src={summary["Document Front"]} alt="Front ID Document" />
              </div>
              <div className="document-info">
                <span className="document-name">ID Front</span>
              </div>
            </div>

            <div className="document-item">
              <div className="document-image-container">
                <img src={summary["Document Back"]} alt="Back ID Document" />
              </div>
              <div className="document-info">
                <span className="document-name">ID Back</span>
              </div>
            </div>

            <div className="document-item">
              <div className="document-image-container">
                <img src={summary["Face Image"]} alt="Live Photo" />
              </div>
              <div className="document-info">
                <span className="document-name">Face Capture</span>
              </div>
            </div>
          </div>
        </div>

        <div className="divider"></div>

        <div className="verified-info">
          <h3>Submitted Personal Information</h3>
          <table className="info-table">
            <tbody>
              <tr>
                <td className="info-label">Name:</td>
                <td className="info-value">{summary["Full Name"] || "N/A"}</td>
              </tr>
              <tr>
                <td className="info-label">ID Number:</td>
                <td className="info-value">{summary["ID Number"] || "N/A"}</td>
              </tr>
              <tr>
                <td className="info-label">Gender:</td>
                <td className="info-value">{summary["Gender"] || "N/A"}</td>
              </tr>
              <tr>
                <td className="info-label">Email:</td>
                <td className="info-value">{summary["Email"] || "N/A"}</td>
              </tr>
              <tr>
                <td className="info-label">Date of Birth:</td>
                <td className="info-value">
                  {summary["Date of Birth"] || "N/A"}
                </td>
              </tr>
              <tr>
                <td className="info-label">ID Issue Date:</td>
                <td className="info-value">
                  {summary["ID Issue Date"] || "N/A"}
                </td>
              </tr>
              <tr>
                <td className="info-label">ID Expiry Date:</td>
                <td className="info-value">
                  {summary["ID Expiry Date"] || "N/A"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="done-button-container">
          <button onClick={onDone} className="done-button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerificationSummary;
