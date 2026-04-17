"use client";

import { View, Text } from "@react-pdf/renderer";
import { s } from "./pdfStyles";

export default function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        www.taifukai.com | info@taifukai.com | License: 91310000MAE2LJA47A
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}
