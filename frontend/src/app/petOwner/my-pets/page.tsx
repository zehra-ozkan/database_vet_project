"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";

type PetRow = {
  petid: number;
  name: string;
  species: string | null;
  breed: string | null;
  age: number | null;
  allergies: string | null;
  chipid: number | null;
};

type PetFormState = {
  name: string;
  species: string;
  breed: string;
  age: string;
  allergies: string;
};

const emptyPetForm: PetFormState = {
  name: "",
  species: "",
  breed: "",
  age: "",
  allergies: "",
};

export default function PetOwnerMyPetsPage() {
  const [pets, setPets] = useState<PetRow[]>([]);
  const [form, setForm] = useState<PetFormState>(emptyPetForm);
  const [editPetId, setEditPetId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PetFormState>(emptyPetForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ownerId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return null;
    try {
      return (JSON.parse(savedUser) as { id?: number }).id ?? null;
    } catch {
      return null;
    }
  }, []);

  const loadPets = async () => {
    if (!ownerId) {
      setError("Owner id is missing. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      const rows = await apiGet<PetRow[]>("/petOwner/pets", { ownerId });
      setPets(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const startEdit = (pet: PetRow) => {
    setEditPetId(pet.petid);
    setEditForm({
      name: pet.name ?? "",
      species: pet.species ?? "",
      breed: pet.breed ?? "",
      age: pet.age === null || pet.age === undefined ? "" : String(pet.age),
      allergies: pet.allergies ?? "",
    });
  };

  const handleAddPet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerId) return;

    try {
      setSaving(true);
      setError("");
      await apiSend("/petOwner/pets", "POST", {
        ownerId,
        name: form.name,
        species: form.species,
        breed: form.breed,
        age: Number(form.age),
        allergies: form.allergies || null,
      });
      setForm(emptyPetForm);
      await loadPets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add pet");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerId || editPetId === null) return;

    try {
      setSaving(true);
      setError("");
      await apiSend(`/petOwner/pets/${editPetId}`, "PATCH", {
        ownerId,
        name: editForm.name,
        species: editForm.species,
        breed: editForm.breed,
        age: Number(editForm.age),
        isAlive: true,
        allergies: editForm.allergies || null,
      });
      setEditPetId(null);
      setEditForm(emptyPetForm);
      await loadPets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update pet");
    } finally {
      setSaving(false);
    }
  };

  return (
        <section className="card">
          <h1 className="page-title">My Pets</h1>

          {error ? (
            <div className="tile" style={{ color: "#be123c", fontWeight: 700 }}>
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="tile">
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Loading your pets...
              </p>
            </div>
          ) : null}

          {!loading && pets.length === 0 ? (
            <div className="tile">
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                No pets registered yet.
              </p>
            </div>
          ) : null}

          <div className="panels" style={{ gridTemplateColumns: "1fr" }}>
            {pets.map((pet) => (
              <article
                key={pet.petid}
                className="tile"
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}
              >
                <div>
                  <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>{pet.name}</h2>
                  <p className="muted" style={{ margin: "5px 0", fontSize: "13px" }}>
                    {pet.species || "No data"} · {pet.breed || "No data"} · {pet.age ?? "No data"} years
                  </p>
                  <p className="muted" style={{ margin: "5px 0", fontSize: "13px" }}>
                    Allergies: {pet.allergies ?? "No data"}
                  </p>
                  <p className="muted" style={{ margin: "5px 0", fontSize: "13px" }}>
                    Microchip: {pet.chipid ?? "Not registered"}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Link className="btn" href={`/petOwner/pet/${pet.petid}`}>
                    View Profile
                  </Link>
                  <Link className="btn ghost" href={`/petOwner/pet/${pet.petid}#microchip`}>
                    {pet.chipid ? "Microchip" : "Register Chip"}
                  </Link>
                  <button type="button" className="btn ghost" onClick={() => startEdit(pet)}>
                    Edit
                  </button>
                </div>

                {editPetId === pet.petid ? (
                  <form onSubmit={handleUpdatePet} className="card" style={{ gridColumn: "1 / -1", marginBottom: 0 }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Name</label>
                        <input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} required />
                      </div>
                      <div className="form-group">
                        <label>Species</label>
                        <input value={editForm.species} onChange={(event) => setEditForm((prev) => ({ ...prev, species: event.target.value }))} required />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Breed</label>
                        <input value={editForm.breed} onChange={(event) => setEditForm((prev) => ({ ...prev, breed: event.target.value }))} required />
                      </div>
                      <div className="form-group">
                        <label>Age</label>
                        <input type="number" min="0" value={editForm.age} onChange={(event) => setEditForm((prev) => ({ ...prev, age: event.target.value }))} required />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Allergies</label>
                      <input value={editForm.allergies} onChange={(event) => setEditForm((prev) => ({ ...prev, allergies: event.target.value }))} />
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button className="btn" type="submit" disabled={saving}>
                        Save
                      </button>
                      <button className="btn ghost" type="button" onClick={() => setEditPetId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>

          <div className="card mt-3" style={{ borderStyle: "dashed" }}>
            <h2 className="page-title" style={{ fontSize: "18px" }}>
              Add New Pet
            </h2>
            <form onSubmit={handleAddPet}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Species</label>
                  <input value={form.species} onChange={(event) => setForm((prev) => ({ ...prev, species: event.target.value }))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Breed</label>
                  <input value={form.breed} onChange={(event) => setForm((prev) => ({ ...prev, breed: event.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Age</label>
                  <input type="number" min="0" value={form.age} onChange={(event) => setForm((prev) => ({ ...prev, age: event.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label>Allergies</label>
                <input value={form.allergies} onChange={(event) => setForm((prev) => ({ ...prev, allergies: event.target.value }))} />
              </div>
              <button className="btn" type="submit" disabled={saving}>
                Submit
              </button>
            </form>
          </div>
        </section>
  );
}
