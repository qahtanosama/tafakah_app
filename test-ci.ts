import { renderToStream } from "@react-pdf/renderer";
import React from "react";
import CI from "./src/components/commercial-invoice/CommercialInvoicePDF";

(async () => {
  const data = {
    identifiers: { contractDate: "2024-01-01", numberOfContainers: 1 },
    buyer: { company: "Test Company", address: "123 Main St", cityPostal: "12345", email: "test@test.com" },
    shipping: { origin: "China", loadingPort: "Shanghai", dischargePort: "LA" },
    terms: { containerType: "40RH" },
    lineItems: [
        { product: "Test", pricePerCarton: 10, cartons: 100, qtyMTS: 1, hsCode: "123", nwPerCarton: 10 }
    ],
  };
  const totals = { totalUSD: 1000 };
  const contractNumber = "SC-123";
  const invoiceNumber = "CI-123";

  try {
    const stream = await renderToStream(React.createElement(CI as any, { data, totals, contractNumber, invoiceNumber }));
    console.log("Success!");
  } catch(e) { console.error(e); }
})();
