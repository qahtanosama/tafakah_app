/**
 * Hand a priced shipment over to the Master Data form.
 *
 * The old "Draft" button wrote a `master-draft` localStorage key that nothing
 * in the repo ever read, so the quote was silently dropped and the user landed
 * on an empty form. The real draft the /master form hydrates from is
 * `tafakah-master-data` via loadMasterData(), holding a full SalesContractData
 * — so write that, merging into any draft already in progress rather than
 * flattening the buyer, ports and payment terms someone already filled in.
 */

import type { SalesContractData } from "@/types/sales-contract";
import { joinIncoterm, splitIncoterm } from "@/types/sales-contract";
import { loadMasterData, saveMasterData } from "@/lib/master-data";
import { calcPricePerCarton, calcQtyMTS, getDefaultContractData, getHSCode } from "@/lib/sales-contract";
import { CONTAINER_TYPE } from "./defaults";
import { portShortName } from "./quote-text";

export interface MasterDraftInput {
  productName: string;
  hsCode: string;
  nwPerCarton: number;
  gwPerCarton: number;
  /** Per container — LineItem.cartons is per-container and calcTotals()
   *  multiplies it by terms.numberOfContainers. */
  cartonsPerContainer: number;
  containers: number;
  pricePerMT: number;
  /**
   * The route the quote was priced on. Carried through so the contract opens on
   * the ports the offer named — the destination is chosen per quote precisely
   * because it changes with the buyer, and a contract that reverts to the
   * default would undo that choice.
   */
  loadingPort: string;
  dischargePort: string;
}

export function sendToMasterData(input: MasterDraftInput): void {
  const base: SalesContractData = loadMasterData() ?? getDefaultContractData();
  const [first, ...rest] = base.lineItems;

  saveMasterData({
    ...base,
    lineItems: [
      {
        id: first?.id ?? crypto.randomUUID(),
        product: input.productName,
        hsCode: input.hsCode || getHSCode(input.productName),
        nwPerCarton: input.nwPerCarton,
        gwPerCarton: input.gwPerCarton,
        cartons: input.cartonsPerContainer,
        qtyMTS: calcQtyMTS(input.nwPerCarton, input.cartonsPerContainer),
        pricePerMT: input.pricePerMT,
        pricePerCarton: calcPricePerCarton(input.nwPerCarton, input.pricePerMT),
      },
      ...rest,
    ],
    shipping: {
      ...base.shipping,
      loadingPort: input.loadingPort || base.shipping.loadingPort,
      dischargePort: input.dischargePort || base.shipping.dischargePort,
      // The quote was made CIF that port, so the contract's incoterm names the
      // same place. The term itself (CIF/FOB/…) is whatever the draft already had.
      incoterm: input.dischargePort
        ? joinIncoterm(splitIncoterm(base.shipping.incoterm).term, portShortName(input.dischargePort).toUpperCase())
        : base.shipping.incoterm,
    },
    terms: {
      ...base.terms,
      containerType: CONTAINER_TYPE,
      numberOfContainers: input.containers,
    },
  });
}
