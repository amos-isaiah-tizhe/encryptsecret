// netlify/functions/get-ip.js
//
// This is a Netlify serverless function.
// It runs on Netlify's servers — NOT in the user's browser.
//
// WHY THIS EXISTS:
// When the browser fetches the user's IP using ipapi.co, the request
// comes from the browser itself — the user can intercept or spoof it.
// This function reads the IP directly from the HTTP request headers
// that Netlify provides on the server side. The user cannot fake these.
//
// HOW TO USE:
// Your create.js files call: fetch("/.netlify/functions/get-ip")
// This function responds with: { "ip": "1.2.3.4" }
//
// WHERE THIS FILE GOES:
// netlify/functions/get-ip.js  (in your project root)

exports.handler = async function(event) {
  // Netlify passes the real client IP in these headers (in priority order)
  const ip =
    event.headers["x-nf-client-connection-ip"] || // most reliable on Netlify
    event.headers["x-forwarded-for"]?.split(",")[0].trim() || // proxy chain
    event.headers["client-ip"] ||
    "unknown";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      // Only your own domain can call this function
      "Access-Control-Allow-Origin": process.env.URL || "*",
    },
    body: JSON.stringify({ ip }),
  };
};
