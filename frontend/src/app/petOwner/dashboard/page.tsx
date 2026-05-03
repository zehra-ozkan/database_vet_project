"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StoredUser = {
  name?: string;
};

export default function PetOwnerDashboardPage() {
  const [ownerName, setOwnerName] = useState("Pet Owner");

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return;

    try {
      const user = JSON.parse(savedUser) as StoredUser;
      setOwnerName(user.name || "Pet Owner");
    } catch {
      setOwnerName("Pet Owner");
    }
  }, []);

  return (
    <section className="card">
      <h1 className="page-title">Welcome back, {ownerName}</h1>
      <p className="page-subtitle">Track your pet health across branches: appointments, prescriptions, vaccinations, bills, and microchip/lost-found records.</p>
      <div className="panels">
        <Link href="/petOwner/my-pets" className="tile">
          <div className="font-bold">My Pets</div>
          <p className="muted m-0 mt-1 text-sm">Manage pet profiles and chip records.</p>
        </Link>
        <Link href="/petOwner/lost-found" className="tile">
          <div className="font-bold">Lost &amp; Found</div>
          <p className="muted m-0 mt-1 text-sm">Create and review lost pet reports.</p>
        </Link>
      </div>
    </section>
  );
}
