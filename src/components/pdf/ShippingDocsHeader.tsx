import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ContractContainer } from "@/types/contract";

const styles = StyleSheet.create({
  box: {
    marginTop: 6,
    marginBottom: 6,
    padding: 6,
    borderWidth: 0.5,
    borderColor: "#CCCCCC",
    backgroundColor: "#F2F2F2",
  },
  line: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 1,
  },
  label: {
    fontFamily: "Times-Bold",
    fontSize: 9,
    marginRight: 4,
  },
  value: {
    fontSize: 9,
  },
});

interface Props {
  blNumber?: string | null;
  containers?: ContractContainer[];
}

/**
 * Compact header block rendered on CI / PL / CI-Customs PDFs.
 * Returns null when there's nothing to show so we don't leave an empty box on
 * pre-shipment renderings.
 */
export default function ShippingDocsHeader({ blNumber, containers }: Props) {
  const bl = (blNumber ?? "").trim();
  const numbers = (containers ?? [])
    .map((c) => c.number?.trim())
    .filter((n): n is string => !!n);

  if (!bl && numbers.length === 0) return null;

  return (
    <View style={styles.box}>
      {bl ? (
        <View style={styles.line}>
          <Text style={styles.label}>B/L No.:</Text>
          <Text style={styles.value}>{bl}</Text>
        </View>
      ) : null}
      {numbers.length > 0 ? (
        <View style={styles.line}>
          <Text style={styles.label}>Containers:</Text>
          <Text style={styles.value}>{numbers.join(", ")}</Text>
        </View>
      ) : null}
    </View>
  );
}
