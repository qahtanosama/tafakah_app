/**
 * The built-in issuing entity, and how a document resolves one.
 *
 * Pure module — imported by PDF components that render on the server as well as
 * in the browser, so NO "use client" here.
 *
 * TAFAKAH is written down here as well as seeded into the issuing_entities
 * table. That is deliberate, not duplication for its own sake: a document must
 * still render its correct letterhead when the entities query has not resolved,
 * has failed, or the migration has not been run. issuing-entities.test.ts pins
 * these values against the header that shipped before entities existed.
 */

import type { IssuingEntity } from "@/types/issuing-entity";

export const TAFAKAH_ENTITY: IssuingEntity = {
  id: "tafakah",
  name: "TAFAKAH Food (Shanghai) Co., Ltd.",
  nameCn: "泰福凯食品贸易（上海）有限公司",
  addressLines: ["Room 116, Building 1,", "258-288 Youdong Road,", "Minhang District, Shanghai, China"],
  legalName: "TAFAKAH Food (SHANGHAI) CO., LTD",
  legalAddress: "ROOM 116, BUILDING 1, 258-288 YOUDONG ROAD, MINHANG DISTRICT, SHANGHAI, CHINA",
  tel: "+86 187 2116 0270",
  email: "Info@taifukai.com",
  bank: {
    swift: "CZCBCN2X",
    beneficiary: "TAFAKAH Food (Shanghai) CO., LTD",
    account: "56512142010360000033",
    bank: "Zhejiang Chouzhou Commercial Bank Co., Ltd",
    bankAddress: "Yiwu Leyuan East Jiangbin Road, Yiwu, Zhejiang, China",
    postCode: "322100",
  },
  logoUrl: "/logo.png",
  stampUrl: "",
  isDefault: true,
  sortOrder: 0,
};

/**
 * The entity a document should print, given the list and an optional choice.
 *
 * Falls back, in order: the chosen entity, the list's default, the first row,
 * then the built-in. A document never renders without a letterhead.
 */
export function resolveEntity(
  entities: IssuingEntity[] | undefined,
  entityId?: string
): IssuingEntity {
  const list = entities ?? [];
  return (
    (entityId ? list.find((e) => e.id === entityId) : undefined) ??
    list.find((e) => e.isDefault) ??
    list[0] ??
    TAFAKAH_ENTITY
  );
}
