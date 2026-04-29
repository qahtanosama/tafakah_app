
import { View, Text, Image } from "@react-pdf/renderer";
import { s } from "./pdfStyles";
import { getAbsoluteUrl } from "./utils";

const isServer = typeof window === "undefined";

export default function Letterhead() {
  return (
    <View fixed>
      <View style={s.letterhead}>
        <View style={s.letterheadLeft}>
          <Text style={s.letterheadTextBold}>
            TAFAKAH Food (Shanghai) Co., Ltd.
          </Text>
          <Text style={s.letterheadChinese}>
            {"\u6CF0\u798F\u51EF\u98DF\u54C1\u8D38\u6613\uFF08\u4E0A\u6D77\uFF09\u6709\u9650\u516C\u53F8"}
          </Text>
        </View>
        <View style={s.letterheadCenter}>
          <Image
            src={isServer ? require("path").join(process.cwd(), "public/logo.png") : getAbsoluteUrl("/logo.png")}
            style={{ width: 55, height: 55, objectFit: "contain" }}
          />
        </View>
        <View style={s.letterheadRight}>
          <Text style={[s.letterheadText, { textAlign: "right" }]}>
            Room 116, Building 1,
          </Text>
          <Text style={[s.letterheadText, { textAlign: "right" }]}>
            258-288 Youdong Road,
          </Text>
          <Text style={[s.letterheadText, { textAlign: "right" }]}>
            Minhang District, Shanghai, China
          </Text>
        </View>
      </View>
      <View style={s.letterheadDivider} />
    </View>
  );
}
