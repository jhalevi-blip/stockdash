import { Suspense } from "react";
import LandingPage from "./landing-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}
