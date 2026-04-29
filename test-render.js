require("dotenv").config({ path: ".env.local" });
const React = require("react");
const { renderToStream } = require("@react-pdf/renderer");
const { default: CI } = require("./.next/server/app/api/portal/generate-pdf/route.js") || require("./src/components/commercial-invoice/CommercialInvoicePDF");
// wait, I can just use babel-register or tsx to run this.
