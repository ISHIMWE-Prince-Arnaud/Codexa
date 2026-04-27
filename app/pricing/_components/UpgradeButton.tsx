import { Zap } from "lucide-react";
import Link from "next/link";

export default function UpgradeButton() {
  const CHECKOUT_URL = process.env.NEXT_PUBLIC_LEMON_SQUEEZY_CHECKOUT_URL;

  if (!CHECKOUT_URL) {
    throw new Error("NEXT_PUBLIC_LEMON_SQUEEZY_CHECKOUT_URL environment variable is not set");
  }

  return (
    <Link
      href={CHECKOUT_URL}
      className="inline-flex items-center justify-center gap-2 px-8 py-4 text-white 
        bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg 
        hover:from-blue-600 hover:to-blue-700 transition-all"
    >
      <Zap className="w-5 h-5" />
      Upgrade to Pro
    </Link>
  );
}
