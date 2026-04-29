import { renderToStream } from "@react-pdf/renderer";
import React from "react";
import { Document, Page, Text } from "@react-pdf/renderer";
const MyDoc = () => React.createElement(Document, null, React.createElement(Page, null, React.createElement(Text, null, "Hello world")));
(async () => {
  try {
    const stream = await renderToStream(React.createElement(MyDoc));
    console.log("Success!");
  } catch(e) { console.error(e); }
})();
