// src/components/Billing.jsx
import React from "react";

const Billing = () => {
  const plans = [
    { name: "Basic", price: "₹1,999", invoices: 100, users: 1, support: "Email" },
    { name: "Professional", price: "₹3,999", invoices: 500, users: 3, support: "Priority" },
    { name: "Enterprise", price: "₹7,999", invoices: "Unlimited", users: 10, support: "24/7" }
  ];

  const currentPlan = "Professional";

  return (
    <div className="billing-page">
      <h2>Billing & Subscription</h2>

      <div className="current-plan">
        <h3>Current Plan: {currentPlan}</h3>
        <p>Next billing date: Feb 15, 2024</p>
        <button className="btn btn-primary">Upgrade Plan</button>
      </div>

      <div className="plans-grid">
        {plans.map(plan => (
          <div className={`plan-card ${plan.name === currentPlan ? 'current' : ''}`} key={plan.name}>
            <h3>{plan.name}</h3>
            <div className="plan-price">{plan.price}<span>/month</span></div>
            <ul className="plan-features">
              <li>✓ {plan.invoices} invoices/month</li>
              <li>✓ Up to {plan.users} users</li>
              <li>✓ {plan.support} support</li>
              <li>✓ Basic integrations</li>
            </ul>
            <button className={`btn ${plan.name === currentPlan ? 'btn-outline' : 'btn-primary'}`}>
              {plan.name === currentPlan ? 'Current Plan' : 'Switch'}
            </button>
          </div>
        ))}
      </div>

      <div className="billing-history">
        <h3>Billing History</h3>
        <table className="billing-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Jan 15, 2024</td>
              <td>INV-2024-001</td>
              <td>₹3,999</td>
              <td><span className="status-badge status-paid">Paid</span></td>
              <td><button className="btn-link">Download</button></td>
            </tr>
            <tr>
              <td>Dec 15, 2023</td>
              <td>INV-2023-089</td>
              <td>₹3,999</td>
              <td><span className="status-badge status-paid">Paid</span></td>
              <td><button className="btn-link">Download</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Billing;