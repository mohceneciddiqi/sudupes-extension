export const PRICE_HIKE_HTML = `
<div id="subdupes-hike-alert" style="
  position: fixed;
  top: 20px;
  right: 20px;
  width: 300px;
  background: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  z-index: 99999;
  font-family: system-ui, -apple-system, sans-serif;
  border-left: 4px solid #F59E0B;
  animation: slideIn 0.3s ease-out;
">
  <div style="padding: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: start;">
      <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">Price Change Detected</h3>
      <button id="sd-close" style="background: none; border: none; cursor: pointer; color: #9CA3AF;">&times;</button>
    </div>
    
    <div style="margin-top: 8px; font-size: 13px; color: #4B5563;">
      <p style="margin: 0;">We noticed a difference from your last payment:</p>
      <div style="display: flex; justify-content: space-between; margin-top: 8px; padding: 8px; background: #F3F4F6; border-radius: 4px;">
        <span>Last Paid:</span>
        <span style="font-weight: 600;">$__LAST_PRICE__</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 4px; padding: 8px; background: #FEF3C7; border-radius: 4px; color: #92400E;">
        <span>Current:</span>
        <span style="font-weight: 600;">$__CURRENT_PRICE__</span>
      </div>
    </div>
  </div>
</div>
`;
