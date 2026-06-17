import { redirect } from "next/navigation";

export default function Home() {
  // This is a server component — we redirect to dashboard
  // The dashboard page will check health and redirect to onboarding if needed
  redirect("/dashboard");
}
