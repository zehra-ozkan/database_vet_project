"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, formatDate } from "@/lib/api";

type PetListRow = {
  petid: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  isalive: boolean;
};

type PetProfileRow = {
  petid: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  sex: string | null;
  canbreed: boolean | null;
  isalive: boolean;
  chipid: string | null;
  implantationdate: string | null;
  islost: boolean | null;
};

type PetCard = {
  id: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  allergies: string;
  isAlive: boolean;
  sex: string | null;
  canBreed: boolean | null;
  chipId: string | null;
  chipImplantationDate: string | null;
  chipLost: boolean | null;
};

type PetFormState = {
  petId: string;
  name: string;
  sex: string;
  canBreed: boolean;
  age: string;
  isAlive: boolean;
  species: string;
  breed: string;
};

type ChipFormState = {
  chipId: string;
  location: string;
  veterinarianId: string;
  implantationDate: string;
  isLost: boolean;
};

export default function PetOwnerMyPetsPage() {
  const [pets, setPets] = useState<PetCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingPetId, setEditingPetId] = useState<number | null>(null);
  const [petForm, setPetForm] = useState<PetFormState>({
    petId: "",
    name: "",
    sex: "",
    canBreed: false,
    age: "",
    isAlive: true,
    species: "",
    breed: "",
  });
  const [allergyForm, setAllergyForm] = useState({
    pastDiagnosis: "",
    previousAllergies: "",
    allergies: "",
  });
  const [chipForm, setChipForm] = useState<ChipFormState>({
    chipId: "",
    location: "",
    veterinarianId: "",
    implantationDate: "",
    isLost: false,
  });
  const ownerId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return null;
    try {
      const user = JSON.parse(savedUser) as { id?: number };
      return user.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  useEffect(() => {
    let active = true;

    async function loadPets() {
      try {
        if (!ownerId) {
          throw new Error("Owner id is missing. Please log in again.");
        }
        const [listRows, profileRows] = await Promise.all([
          apiGet<PetListRow[]>("/owner/pets", { ownerId }),
          apiGet<PetProfileRow[]>("/owner/pets/profile", { ownerId }),
        ]);

        const profileMap = new Map(profileRows.map((row) => [row.petid, row]));
        const merged = listRows.map((row) => {
          const profile = profileMap.get(row.petid);
          return {
            id: row.petid,
            name: row.name,
            species: row.species,
            breed: row.breed,
            age: row.age,
            allergies: "Not provided",
            isAlive: profile?.isalive ?? row.isalive,
            sex: profile?.sex ?? null,
            canBreed: profile?.canbreed ?? null,
            chipId: profile?.chipid ?? null,
            chipImplantationDate: profile?.implantationdate ?? null,
            chipLost: profile?.islost ?? null,
          } as PetCard;
        });

        if (active) {
          setPets(merged);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load pets");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPets();
    return () => {
      active = false;
    };
  }, [ownerId]);

  const handleAddPet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerId) {
      setError("Owner id is missing. Please log in again.");
      return;
    }

    try {
      await apiSend("/owner/pets", "POST", {
        petId: Number(petForm.petId),
        name: petForm.name,
        sex: petForm.sex,
        canBreed: petForm.canBreed,
        age: Number(petForm.age),
        isAlive: petForm.isAlive,
        species: petForm.species,
        breed: petForm.breed,
        ownerId,
      });
      setPetForm({ petId: "", name: "", sex: "", canBreed: false, age: "", isAlive: true, species: "", breed: "" });
      setLoading(true);
      setError("");
      const [listRows, profileRows] = await Promise.all([
        apiGet<PetListRow[]>("/owner/pets", { ownerId }),
        apiGet<PetProfileRow[]>("/owner/pets/profile", { ownerId }),
      ]);
      const profileMap = new Map(profileRows.map((row) => [row.petid, row]));
      setPets(
        listRows.map((row) => {
          const profile = profileMap.get(row.petid);
          return {
            id: row.petid,
            name: row.name,
            species: row.species,
            breed: row.breed,
            age: row.age,
            allergies: "Not provided",
            isAlive: profile?.isalive ?? row.isalive,
            sex: profile?.sex ?? null,
            canBreed: profile?.canbreed ?? null,
            chipId: profile?.chipid ?? null,
            chipImplantationDate: profile?.implantationdate ?? null,
            chipLost: profile?.islost ?? null,
          } as PetCard;
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add pet");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePet = async (pet: PetCard) => {
    if (!ownerId) {
      setError("Owner id is missing. Please log in again.");
      return;
    }

    try {
      await apiSend(`/owner/pets/${pet.id}`, "PATCH", {
        name: petForm.name || pet.name,
        species: petForm.species || pet.species,
        breed: petForm.breed || pet.breed,
        age: petForm.age ? Number(petForm.age) : pet.age,
        isAlive: petForm.isAlive,
        ownerId,
      });
      setEditingPetId(null);
      setPetForm({ petId: "", name: "", sex: "", canBreed: false, age: "", isAlive: true, species: "", breed: "" });
      setLoading(true);
      setError("");
      const [listRows, profileRows] = await Promise.all([
        apiGet<PetListRow[]>("/owner/pets", { ownerId }),
        apiGet<PetProfileRow[]>("/owner/pets/profile", { ownerId }),
      ]);
      const profileMap = new Map(profileRows.map((row) => [row.petid, row]));
      setPets(
        listRows.map((row) => {
          const profile = profileMap.get(row.petid);
          return {
            id: row.petid,
            name: row.name,
            species: row.species,
            breed: row.breed,
            age: row.age,
            allergies: "Not provided",
            isAlive: profile?.isalive ?? row.isalive,
            sex: profile?.sex ?? null,
            canBreed: profile?.canbreed ?? null,
            chipId: profile?.chipid ?? null,
            chipImplantationDate: profile?.implantationdate ?? null,
            chipLost: profile?.islost ?? null,
          } as PetCard;
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update pet");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAllergies = async (pet: PetCard) => {
    try {
      await apiSend(`/owner/pets/${pet.id}/allergies`, "PATCH", {
        pastDiagnosis: allergyForm.pastDiagnosis,
        previousAllergies: allergyForm.previousAllergies,
        allergies: allergyForm.allergies,
      });
      setAllergyForm({ pastDiagnosis: "", previousAllergies: "", allergies: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update allergies");
    }
  };

  const handleRegisterChip = async (pet: PetCard) => {
    try {
      await apiSend(`/owner/pets/${pet.id}/chip`, "POST", {
        chipId: Number(chipForm.chipId),
        location: chipForm.location,
        veterinarianId: Number(chipForm.veterinarianId),
        implantationDate: chipForm.implantationDate,
        isLost: chipForm.isLost,
      });
      setChipForm({ chipId: "", location: "", veterinarianId: "", implantationDate: "", isLost: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register chip");
    }
  };

  if (loading) return <PetOwnerLoading label="Loading your pets..." />;
  if (error) return <PetOwnerError message={error} />;

  return (
    <div className="pet-owner">
      <div className="container">
        <header className="header-split">
          <div className="header-left">
            <Link href="/petOwner/dashboard" className="brand brand-icon" aria-label="VetChain home">
              <div className="mark" />
            </Link>
          </div>
          <div className="header-right">
            <nav className="nav nav-right">
              <Link href="/petOwner/dashboard">Dashboard</Link>
              <Link href="/petOwner/book">Book</Link>
              <Link href="/petOwner/appointments">Appointments</Link>
              <Link href="/petOwner/lost-found">Lost &amp; Found</Link>
            </nav>
            <div className="header-actions">
              <details className="profile-dropdown">
                <summary className="profile-trigger">ME</summary>
                <div className="profile-menu">
                  <Link href="/petOwner/my-pets">My Pets</Link>
                  <button type="button" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>

        <section className="card">
          <h1 className="page-title">My Pets</h1>
          <p className="page-subtitle">Manage pet profiles: species, breed, age, and allergies</p>

          <div className="panels" style={{ gridTemplateColumns: "1fr" }}>
            {pets.length === 0 ? (
              <div className="tile">
                <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                  No pets registered yet. Use the form below to add your first pet.
                </p>
              </div>
            ) : null}
            {pets.map((pet) => (
              <div
                key={pet.id}
                className="tile"
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: "16px" }}>{pet.name}</div>
                  <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>
                    {pet.species} · {pet.breed} · {pet.age} years
                  </p>
                  <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>
                    Allergies: {pet.allergies}
                  </p>
                  <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>
                    Microchip: {pet.chipId ?? "Not registered"}
                  </p>
                  {pet.chipImplantationDate ? (
                    <p className="muted" style={{ margin: "4px 0", fontSize: "12px" }}>
                      Implanted on {formatDate(pet.chipImplantationDate)}
                    </p>
                  ) : null}
                  {pet.chipLost ? (
                    <p className="muted" style={{ margin: "4px 0", fontSize: "12px", color: "#e11d48" }}>
                      Status: Reported lost
                    </p>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="btn">View Profile</button>
                  <button className="btn ghost" type="button" onClick={() => setEditingPetId(editingPetId === pet.id ? null : pet.id)}>
                    {editingPetId === pet.id ? "Close" : "Edit"}
                  </button>
                </div>
                {editingPetId === pet.id ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="card mt-3">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Name</label>
                          <input value={petForm.name} onChange={(event) => setPetForm((prev) => ({ ...prev, name: event.target.value }))} placeholder={pet.name} />
                        </div>
                        <div className="form-group">
                          <label>Species</label>
                          <input value={petForm.species} onChange={(event) => setPetForm((prev) => ({ ...prev, species: event.target.value }))} placeholder={pet.species} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Breed</label>
                          <input value={petForm.breed} onChange={(event) => setPetForm((prev) => ({ ...prev, breed: event.target.value }))} placeholder={pet.breed} />
                        </div>
                        <div className="form-group">
                          <label>Age</label>
                          <input type="number" value={petForm.age} onChange={(event) => setPetForm((prev) => ({ ...prev, age: event.target.value }))} placeholder={String(pet.age)} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Alive</label>
                          <input type="checkbox" checked={petForm.isAlive} onChange={(event) => setPetForm((prev) => ({ ...prev, isAlive: event.target.checked }))} />
                        </div>
                        <div className="form-group">
                          <label>Can breed</label>
                          <input type="checkbox" checked={petForm.canBreed} onChange={(event) => setPetForm((prev) => ({ ...prev, canBreed: event.target.checked }))} />
                        </div>
                      </div>
                      <button type="button" className="btn" onClick={() => handleUpdatePet(pet)}>
                        Save profile changes
                      </button>
                    </div>

                    <div className="card mt-3">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Past diagnosis</label>
                          <input value={allergyForm.pastDiagnosis} onChange={(event) => setAllergyForm((prev) => ({ ...prev, pastDiagnosis: event.target.value }))} placeholder="Initial profile entry" />
                        </div>
                        <div className="form-group">
                          <label>Current allergies</label>
                          <input value={allergyForm.previousAllergies} onChange={(event) => setAllergyForm((prev) => ({ ...prev, previousAllergies: event.target.value }))} placeholder="Chicken, grain" />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Updated allergies</label>
                        <input value={allergyForm.allergies} onChange={(event) => setAllergyForm((prev) => ({ ...prev, allergies: event.target.value }))} placeholder="Chicken, grain, beef" />
                      </div>
                      <button type="button" className="btn ghost" onClick={() => handleUpdateAllergies(pet)}>
                        Update allergies
                      </button>
                    </div>

                    <div className="card mt-3">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Chip ID</label>
                          <input value={chipForm.chipId} onChange={(event) => setChipForm((prev) => ({ ...prev, chipId: event.target.value }))} placeholder="92810001" />
                        </div>
                        <div className="form-group">
                          <label>Location</label>
                          <input value={chipForm.location} onChange={(event) => setChipForm((prev) => ({ ...prev, location: event.target.value }))} placeholder="Bilkent, Ankara" />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Veterinarian ID</label>
                          <input value={chipForm.veterinarianId} onChange={(event) => setChipForm((prev) => ({ ...prev, veterinarianId: event.target.value }))} placeholder="103" />
                        </div>
                        <div className="form-group">
                          <label>Implantation date</label>
                          <input type="date" value={chipForm.implantationDate} onChange={(event) => setChipForm((prev) => ({ ...prev, implantationDate: event.target.value }))} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Lost</label>
                        <input type="checkbox" checked={chipForm.isLost} onChange={(event) => setChipForm((prev) => ({ ...prev, isLost: event.target.checked }))} />
                      </div>
                      <button type="button" className="btn ghost" onClick={() => handleRegisterChip(pet)}>
                        Register chip
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div id="add" className="card mt-3" style={{ borderStyle: "dashed" }}>
            <h2 className="page-title" style={{ fontSize: "18px" }}>
              Add New Pet
            </h2>
            <p className="page-subtitle" style={{ marginBottom: "16px" }}>
              Create a pet profile with species, breed, age, and allergies
            </p>
            <form onSubmit={handleAddPet}>
              <div className="form-row">
                <div className="form-group">
                  <label>Pet ID</label>
                  <input type="number" placeholder="205" value={petForm.petId} onChange={(event) => setPetForm((prev) => ({ ...prev, petId: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Pet name</label>
                  <input type="text" placeholder="e.g. Max" value={petForm.name} onChange={(event) => setPetForm((prev) => ({ ...prev, name: event.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Species</label>
                  <input type="text" placeholder="Dog" value={petForm.species} onChange={(event) => setPetForm((prev) => ({ ...prev, species: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Breed</label>
                  <input type="text" placeholder="Golden Retriever" value={petForm.breed} onChange={(event) => setPetForm((prev) => ({ ...prev, breed: event.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Age (years)</label>
                  <input type="number" min="0" placeholder="4" value={petForm.age} onChange={(event) => setPetForm((prev) => ({ ...prev, age: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Sex</label>
                  <input type="text" placeholder="M or F" value={petForm.sex} onChange={(event) => setPetForm((prev) => ({ ...prev, sex: event.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Alive</label>
                  <input type="checkbox" checked={petForm.isAlive} onChange={(event) => setPetForm((prev) => ({ ...prev, isAlive: event.target.checked }))} />
                </div>
                <div className="form-group">
                  <label>Can breed</label>
                  <input type="checkbox" checked={petForm.canBreed} onChange={(event) => setPetForm((prev) => ({ ...prev, canBreed: event.target.checked }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Allergies (comma-separated)</label>
                <input type="text" placeholder="e.g. Chicken, grain" />
              </div>
              <button type="submit" className="btn">Add Pet</button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function PetOwnerLoading({ label }: { label: string }) {
  return <div className="rounded-3xl bg-white/80 p-6 text-sm font-semibold text-slate-500 shadow-sm">{label}</div>;
}

function PetOwnerError({ message }: { message: string }) {
  return <div className="rounded-3xl bg-rose-50 p-6 text-sm font-semibold text-rose-700 shadow-sm">{message}</div>;
}
