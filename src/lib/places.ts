/**
 * Inland destinations for overland markets.
 *
 * Deliberately NOT merged into PORTS. That list is also rendered by
 * MasterDataForm's discharge-port picker, and a road destination offered as a
 * port of discharge on a contract is simply wrong. Same shape as `Port` so
 * formatPortValue and the combobox work unchanged.
 *
 * The Russian trade runs China -> Khorgos (gauge break, transhipment) ->
 * through Kazakhstan -> Russia, so the named place on a DAP quote is a city or
 * a wholesale market, not a berth. Food City is the Moscow agri-food cluster
 * most of this produce actually lands at.
 */

import type { Port } from "./ports";
import { PORTS } from "./ports";
import type { Market } from "@/lib/quote/markets";

export const OVERLAND_PLACES: Port[] = [
  // The land crossing itself. Named bare because the stored value round-trips
  // through uppercase, so a "(border)" qualifier would come back title-cased as
  // "(Border)" — and "FCA Khorgos" is the correct incoterm form regardless.
  { code: "KZKHO", name: "Khorgos", country: "Kazakhstan", countryCode: "KZ" },
  { code: "KZALA", name: "Almaty", country: "Kazakhstan", countryCode: "KZ" },
  { code: "RUMOWFC", name: "Food City (Moscow)", country: "Russia", countryCode: "RU" },
  { code: "RUMOW", name: "Moscow", country: "Russia", countryCode: "RU" },
  { code: "RUOVB", name: "Novosibirsk", country: "Russia", countryCode: "RU" },
  { code: "RUSVX", name: "Yekaterinburg", country: "Russia", countryCode: "RU" },
];

/** Which destination list this market's pickers offer. */
export function placesFor(market: Market): Port[] {
  return market.destinations === "overland" ? OVERLAND_PLACES : PORTS;
}
