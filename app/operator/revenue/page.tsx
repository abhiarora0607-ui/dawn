// The old Revenue page is now split across the Money, Product and Control
// tabs. Anyone with the old link (or a bookmark) lands in the right place.

import { redirect } from "next/navigation";

export default function RevenueRedirect() {
  redirect("/operator/money");
}
