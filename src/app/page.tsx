import { redirect } from "next/navigation";

// Server-side redirect — no client-side blank flash on the demo entry URL.
export default function Home() {
  redirect("/dashboard");
}
