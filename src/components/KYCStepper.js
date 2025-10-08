// KYCStepper.js
import React from "react";
import "./KYCStepper.css";

const steps = [
  { number: 1, title: "Personal Details", description: "Enter your information" },
  { number: 2, title: "Document Upload", description: "Upload ID documents" },
  { number: 3, title: "Schedule Slot", description: "Select your timeslot" },
  { number: 4, title: "Review & Confirm", description: "Review details and confirm KYC" },
];

const KYCStepper = ({ currentStep = 0 }) => {
  return (
    <div className="kyc-stepper" role="navigation" aria-label="KYC steps">
      <div className="stepper-wrapper">
        {steps.map((step, index) => (
          <div className="stepper-step" key={index}>
            <div className={`step-circle ${index === currentStep ? "active" : ""}`}>
              {step.number}
            </div>
            <div className="step-info">
              <div className="step-title">{step.title}</div>
              <div className="step-description">{step.description}</div>
            </div>
            {index < steps.length - 1 && <div className="step-line" aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default KYCStepper;
