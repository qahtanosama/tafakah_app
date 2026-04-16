"use client";

import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  block: {
    width: "40%",
    height: 75,
    textAlign: "center",
  },
  stamp: {
    position: "absolute",
    left: "50%",
    top: -20,
    marginLeft: -45,
    width: 90,
    height: 90,
    objectFit: "contain",
    transform: "rotate(-8deg)",
    opacity: 0.92,
  },
  line: {
    borderTopWidth: 1,
    borderColor: "#000",
    marginTop: 45,
    paddingTop: 4,
    fontFamily: "Times-Bold",
    fontSize: 9,
  },
  name: {
    fontSize: 8,
    marginTop: 2,
  },
});

interface Props {
  stamp?: string;
  company: string;
}

export default function SellerSignatureBlock({ stamp, company }: Props) {
  return (
    <View style={s.block}>
      <Text style={s.line}>SELLER</Text>
      <Text style={s.name}>{company}</Text>
      {stamp ? <Image src={stamp} style={s.stamp} /> : null}
    </View>
  );
}
