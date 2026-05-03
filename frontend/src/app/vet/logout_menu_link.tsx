"use client";

import { MouseEvent } from "react";
import { useRouter } from "next/navigation";

export default function LogoutMenuLink() {
  const router = useRouter();

  const handleLogout = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    localStorage.removeItem("user");
    document.cookie = "session_user=; path=/; max-age=0; samesite=lax";
    router.push("/login");
  };

  return (
    <a href="/login" onClick={handleLogout}>
      Logout
    </a>
  );
}
