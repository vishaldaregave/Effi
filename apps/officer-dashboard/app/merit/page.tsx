import { Show } from "@clerk/nextjs";
import { MeritDashboard } from "../../components/merit-dashboard";
import { OfficerAuth } from "../../components/officer-auth";

export default function OfficerMeritPage() {
  return (
    <>
      <Show when="signed-out"><OfficerAuth /></Show>
      <Show when="signed-in"><MeritDashboard /></Show>
    </>
  );
}
