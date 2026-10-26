import { Show } from "@clerk/nextjs";
import { JurisdictionPage } from "../../components/jurisdiction-page";
import { OfficerAuth } from "../../components/officer-auth";

export const metadata = {
  title: "PCMC vs PMC Haad Inspector | Effi Officer Dashboard",
  description:
    "Geospatial coordinate distinction between PCMC, PMC, and Grampanchayat (PMRDA). Inspect Mahanagarpalika Haad, borderland collision buffers, and Overpass interpreter API boundary mappings.",
};

export default function OfficerJurisdictionPage() {
  return (
    <>
      <Show when="signed-out">
        <OfficerAuth />
      </Show>
      <Show when="signed-in">
        <JurisdictionPage />
      </Show>
    </>
  );
}
