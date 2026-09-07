
import { View, Text, Image } from "@react-pdf/renderer";
import type { IssuingEntity } from "@/types/issuing-entity";
import { TAFAKAH_ENTITY } from "@/lib/issuing-entities";
import { s } from "./pdfStyles";
import { getAbsoluteUrl } from "./utils";

const isServer = typeof window === "undefined";

/**
 * Where a letterhead image actually comes from.
 *
 * A bundled asset is stored as a path under /public ("/logo.png") and has to be
 * read off disk when this renders on the server, since react-pdf cannot follow
 * a root-relative path with no origin. An uploaded logo is stored as a full URL
 * from the entity-assets bucket and is already fetchable from either side.
 */
function resolveAsset(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return isServer
    ? require("path").join(process.cwd(), "public", value.replace(/^\//, ""))
    : getAbsoluteUrl(value);
}

/**
 * The header every document carries.
 *
 * `entity` defaults to the built-in TAFAKAH record, so a document that does not
 * name one prints exactly what it printed before entities existed — including
 * while the entities query is still loading, or if the migration has not run.
 */
export default function Letterhead({ entity = TAFAKAH_ENTITY }: { entity?: IssuingEntity }) {
  const logo = entity.logoUrl.trim();
  return (
    <View fixed>
      <View style={s.letterhead}>
        <View style={s.letterheadLeft}>
          <Text style={s.letterheadTextBold}>{entity.name}</Text>
          {entity.nameCn.trim() ? (
            <Text style={s.letterheadChinese}>{entity.nameCn}</Text>
          ) : null}
        </View>
        <View style={s.letterheadCenter}>
          {logo ? (
            <Image src={resolveAsset(logo)} style={{ width: 55, height: 55, objectFit: "contain" }} />
          ) : null}
        </View>
        <View style={s.letterheadRight}>
          {entity.addressLines.map((line, i) => (
            <Text key={i} style={[s.letterheadText, { textAlign: "right" }]}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      <View style={s.letterheadDivider} />
    </View>
  );
}
