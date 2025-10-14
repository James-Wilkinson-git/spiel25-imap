import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  ImageOverlay,
  Polygon,
  Popup,
  Tooltip,
} from "react-leaflet";
import { CRS, LatLngBounds, LatLng } from "leaflet";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import "./normalize.css";
import "./skeleton.css";
import "./index.css";
import { Link } from "react-router";

// Type definitions for Spiel25 map data
interface SpielMapData {
  map: SpielMapInfo;
  mapElements: SpielMapElement[];
  companies: SpielCompany[];
  maps: SpielMapInfo[];
  events?: any[];
}

interface SpielMapInfo {
  ID: string;
  W: number;
  H: number;
  NAME: string;
  PARENT_ELEMENT_ID: string;
  FLOOR: number;
  path?: string;
}

interface SpielMapElement {
  ID: string;
  KARTEN_ID: string;
  X: number;
  Y: number;
  W: number;
  H: number;
  XCOORDS: string | null;
  YCOORDS: string | null;
  TYPE: number; // 0 = stand, 3 = structure/connection
  STAND_ID: string | null;
  NAME: string | null;
}

interface SpielCompany {
  id: number;
  name: string;
  description: string;
  website?: string;
  booths: string[];
}

// Legacy interfaces for compatibility
interface MapData {
  maps: MapInfo[];
  stands: Stand[];
  exhibitors: Exhibitor[];
}

interface MapInfo {
  title: string;
  bounds: string;
  flattened_image: string;
  stands: string[];
}

interface Stand {
  label: string;
  points: [number, number][];
}

interface Exhibitor {
  stand: string;
  title: string;
  description: string;
  logo?: string;
  website?: string;
  url?: string;
  booths?: string[];
}

interface MapStand {
  label: string;
  points: [number, number][];
  exhibitor: {
    stand: string;
    title: string;
    description: string;
    logo: string | null;
    website: string;
    url?: string;
    booths?: string[];
    all: Exhibitor[];
  };
}

export const Map: React.FC = () => {
  const [spielMaps, setSpielMaps] = useState<SpielMapInfo[]>([]);
  const [selectedSpielMap, setSelectedSpielMap] = useState<SpielMapInfo | null>(
    null
  );
  const [mapElements, setMapElements] = useState<SpielMapElement[]>([]);
  const [companies, setCompanies] = useState<SpielCompany[]>([]);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [listKey, setListKey] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteLists, setFavoriteLists] = useState<string[]>([]);
  const [newListName, setNewListName] = useState<string>("");

  function generateRandomListName(): string {
    const adjectives = [
      "brave",
      "cheeky",
      "happy",
      "sleepy",
      "sneaky",
      "gentle",
      "noisy",
      "bouncy",
    ];
    const animals = [
      "otter",
      "fox",
      "tiger",
      "panda",
      "sloth",
      "owl",
      "lizard",
      "turtle",
    ];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adjective}-${animal}`;
  }

  function loadInitialList(): void {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    const params = new URLSearchParams("?" + hash);
    const keyFromHash = params.get("list");
    const favEncoded = params.get("favs");

    if (keyFromHash) {
      let favsFromUrl: string[] = [];
      try {
        if (favEncoded) {
          const decoded = decompressFromEncodedURIComponent(favEncoded);
          if (decoded) {
            favsFromUrl = decoded
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean);
          }
        }
      } catch (e) {
        console.warn("Error decoding favorites from URL:", e);
      }
      setListKey(keyFromHash);
      setFavorites(favsFromUrl);
      return;
    }

    // Migrate legacy
    const legacy: string[] = JSON.parse(
      localStorage.getItem("favorites") || "[]"
    );
    if (legacy.length > 0) {
      const newKey = generateRandomListName();
      localStorage.setItem(`favorites:${newKey}`, JSON.stringify(legacy));
      localStorage.removeItem("favorites");
      setListKey(newKey);
      setFavorites(legacy);
      const compressed = compressToEncodedURIComponent(legacy.join(","));
      window.location.hash = `list=${newKey}&favs=${compressed}`;
      return;
    }

    // Load first saved list
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith("favorites:"))
      .map((k) => k.replace("favorites:", ""));
    if (keys.length > 0) {
      const firstKey = keys[0];
      const stored: string[] = JSON.parse(
        localStorage.getItem(`favorites:${firstKey}`) || "[]"
      );
      setListKey(firstKey);
      setFavorites(stored);
      return;
    }

    // No list at all
    setListKey(null);
    setFavorites([]);
  }

  // Run once on first load
  useEffect(() => {
    loadInitialList();
    const isDesktop = window.innerWidth > 1024;
    setDesktop(isDesktop);
  }, []);

  // Sync favorites to localStorage and URL
  useEffect(() => {
    if (!listKey) return;
    localStorage.setItem(`favorites:${listKey}`, JSON.stringify(favorites));
    const compressed = compressToEncodedURIComponent(favorites.join(","));
    window.location.hash = `list=${listKey}&favs=${compressed}`;
  }, [favorites, listKey]);

  // Load all favorite list names
  useEffect(() => {
    const updateLists = () => {
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith("favorites:"))
        .map((k) => k.replace("favorites:", ""));
      setFavoriteLists(keys);
    };
    updateLists();
  }, [favorites, listKey]);

  // Handle manual hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      loadInitialList();
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    // Load the main map (fairground) to get the list of all maps
    fetch("/spiel-map-0.json")
      .then((res) => res.json())
      .then((data: SpielMapData) => {
        setSpielMaps(data.maps);
        // Start with Hall 1 instead of fairground since it has actual stands
        setSelectedSpielMap(
          data.maps.find((m) => m.ID === "1") || data.maps[0]
        );
        // Don't set fairground data, let the second useEffect load Hall 1 data
      })
      .catch((error) => {
        console.error("Failed to load main map data:", error);
      });
  }, []);

  // Fetch data for the selected map
  useEffect(() => {
    if (!selectedSpielMap) return;

    fetch(`/spiel-map-${selectedSpielMap.ID}.json`)
      .then((res) => res.json())
      .then((data: SpielMapData) => {
        setMapElements(data.mapElements);
        setCompanies(data.companies);
        console.log(
          `Loaded ${data.companies.length} companies for map ${selectedSpielMap.ID}`
        );
        // Debug: Check if we have companies with booth 1E211
        const companiesWithE211 = data.companies.filter((c) =>
          c.booths.includes("1E211")
        );
        console.log(
          `Companies with booth 1E211: ${companiesWithE211.length}`,
          companiesWithE211
        );
      })
      .catch((error) => {
        console.error(
          `Failed to load map data for ${selectedSpielMap.ID}:`,
          error
        );
      });
  }, [selectedSpielMap]);

  const bounds = useMemo(() => {
    if (!selectedSpielMap) return new LatLngBounds([0, 0], [1, 1]);

    // Create bounds from map dimensions (Spiel25 uses direct pixel coordinates)
    const width = selectedSpielMap.W;
    const height = selectedSpielMap.H;

    return new LatLngBounds(
      new LatLng(-height, 0), // SW corner
      new LatLng(0, width) // NE corner
    );
  }, [selectedSpielMap]);

  // Convert Spiel25 mapElements to MapStand format
  const mapStands: MapStand[] = useMemo(() => {
    if (!selectedSpielMap) return [];

    // Filter for stands only (TYPE 0) - include all stands even without company data
    const standElements = mapElements.filter(
      (element) => element.TYPE === 0 && (element.STAND_ID || element.NAME)
    );

    console.log(
      `Processing ${standElements.length} stands for map ${selectedSpielMap.NAME}`
    );

    return standElements
      .map((element) => {
        // Find matching company data based on booth names
        const standId = element.STAND_ID || element.NAME || "";

        // Debug: Check standId format - the issue might be that STAND_ID has prefix
        const boothName = standId.split(".").pop() || standId; // Remove "1." prefix if present

        const matchingCompanies = companies.filter((company) =>
          company.booths.includes(boothName)
        );

        // Convert coordinates from Spiel25 format
        let points: [number, number][] = [];

        if (element.XCOORDS && element.YCOORDS) {
          // Use detailed polygon coordinates if available
          const xCoords = element.XCOORDS.split("|").map(Number);
          const yCoords = element.YCOORDS.split("|").map(Number);

          points = xCoords.map((x, i) => [-yCoords[i], x] as [number, number]);
        } else {
          // Fall back to rectangle from X, Y, W, H
          points = [
            [-element.Y, element.X],
            [-element.Y, element.X + element.W],
            [-(element.Y + element.H), element.X + element.W],
            [-(element.Y + element.H), element.X],
          ];
        }

        const exhibitor = {
          stand: standId,
          title:
            matchingCompanies.length > 0
              ? matchingCompanies.map((c) => c.name).join(" / ")
              : element.NAME || "Unknown",
          description:
            matchingCompanies.length > 0
              ? matchingCompanies.map((c) => c.description).join("\n\n")
              : "No description available",
          logo: null, // Not available in new data structure
          website: matchingCompanies.find((c) => c.website)?.website || "",
          url: matchingCompanies.find((c) => c.website)?.website || "",
          booths:
            matchingCompanies.length > 0
              ? matchingCompanies[0].booths
              : [boothName],
          all: matchingCompanies.map((c) => ({
            stand: standId,
            title: c.name,
            description: c.description,
            website: c.website,
            booths: c.booths,
          })),
        };

        // Debug logging
        if (boothName === "1E211") {
          console.log("Debug for 1E211:", {
            standId,
            boothName,
            matchingCompanies: matchingCompanies.length,
            exhibitor,
          });
        }

        return {
          label: standId,
          points,
          exhibitor,
        } as MapStand;
      })
      .filter((stand) => stand.points.length > 0);
  }, [selectedSpielMap, mapElements, companies]);

  // Debug logging
  console.log(`Rendering ${mapStands.length} stands on map`);
  if (mapStands.length > 0) {
    console.log("First stand:", mapStands[0]);
  }

  const toggleFavorite = (label: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(label)
        ? prev.filter((f) => f !== label)
        : [...prev, label];
      localStorage.setItem(`favorites:${listKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <div className="controls">
        {!listKey && (
          <div>
            <strong>
              Please create a list before using the map or you will get a silly
              name of null.
            </strong>
          </div>
        )}
        <details open>
          <summary>ℹ️ Info 🤏</summary>
          <p>
            Make your selections, then hit share link or copy the browser url
            and open it on your phone. If you go back and forth you will need to
            make a new list first thats not on your other device, with a new
            name.
          </p>
          <p>
            These maps are too busy and big to be able to get print working,
            sorry!
          </p>
          <p>
            All data is copyright Spiel and their Terms of Service and Privacy
            Policy applies to their servers other images copyright their
            respective owners, and this app is brought to you by{" "}
            <a
              href="http://boardgaymesjames.com"
              target="_blank"
              rel="noreferrer"
            >
              @BoardGaymesJames
            </a>{" "}
            provided as is with no warranty.
          </p>
          <p>
            <img
              src="/bo-arnak.png"
              width="150"
              alt="German Shepard Cartoon hold tokens from lost ruins of arnak"
            />
          </p>
        </details>
        <details open>
          <summary>🗺️ Hall Maps 🤏</summary>
          <select
            onChange={(e) => {
              const selected = spielMaps.find((m) => m.NAME === e.target.value);
              setSelectedSpielMap(selected || null);
            }}
            value={selectedSpielMap?.NAME || ""}
          >
            {spielMaps.map((m) => (
              <option key={m.ID} value={m.NAME}>
                {m.NAME}
              </option>
            ))}
          </select>
        </details>
        <details open>
          <summary>📜 Adventure Plans 🤏</summary>
          <button
            className="button"
            onClick={() => {
              const compressed = compressToEncodedURIComponent(
                favorites.join(",")
              );
              const url = `${window.location.origin}${window.location.pathname}#list=${listKey}&favs=${compressed}`;
              navigator.clipboard
                .writeText(url)
                .then(() => alert("Link copied to clipboard!"))
                .catch(() => alert("Failed to copy link"));
            }}
          >
            🔗 Share List
          </button>
          <div>
            <ul>
              {favoriteLists.map((key) => (
                <li key={key}>
                  <button
                    onClick={() => {
                      setListKey(key);
                      const stored = JSON.parse(
                        localStorage.getItem(`favorites:${key}`) || "[]"
                      );
                      setFavorites(stored);
                      window.location.hash = `list=${key}&favs=${stored.join(
                        ","
                      )}`;
                    }}
                  >
                    📄 {key}
                  </button>
                  <button
                    className="x-button"
                    onClick={() => {
                      if (!window.confirm(`Delete list "${key}"?`)) return;

                      // Remove the list
                      localStorage.removeItem(`favorites:${key}`);

                      // If the deleted list is the active one:
                      if (key === listKey) {
                        const allKeys = Object.keys(localStorage)
                          .filter((k) => k.startsWith("favorites:"))
                          .map((k) => k.replace("favorites:", ""));

                        const fallbackKey = allKeys[0] || null;

                        if (fallbackKey) {
                          const fallbackFavorites = JSON.parse(
                            localStorage.getItem(`favorites:${fallbackKey}`) ||
                              "[]"
                          );
                          setListKey(fallbackKey);
                          setFavorites(fallbackFavorites);
                          const compressed = compressToEncodedURIComponent(
                            fallbackFavorites.join(",")
                          );
                          window.location.hash = `list=${fallbackKey}&favs=${compressed}`;
                        } else {
                          setListKey(null);
                          setFavorites([]);
                          window.location.hash = "";
                        }
                      }

                      // Update list view immediately
                      const updatedLists = Object.keys(localStorage)
                        .filter((k) => k.startsWith("favorites:"))
                        .map((k) => k.replace("favorites:", ""));
                      setFavoriteLists(updatedLists);
                    }}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>
            <input
              type="text"
              placeholder="New list name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button
              className="button"
              onClick={() => {
                const newKey = newListName.trim();
                if (newKey && !favoriteLists.includes(newKey)) {
                  localStorage.setItem(`favorites:${newKey}`, "[]");
                  setListKey(newKey);
                  setFavorites([]);
                  setNewListName("");
                  window.location.hash = `list=${newKey}`;
                }
              }}
            >
              ➕ Create
            </button>
          </div>
        </details>
      </div>

      {selectedSpielMap && (
        <MapContainer
          crs={CRS.Simple}
          bounds={bounds}
          minZoom={-2}
          maxZoom={1}
          style={{ height: "100%", width: "100%" }}
        >
          <ImageOverlay url={`/${selectedSpielMap.ID}.png`} bounds={bounds} />
          {mapStands.map((stand) => (
            <Polygon
              key={stand.label}
              pathOptions={{
                color: favorites.includes(stand.label) ? "#27ae60" : "#3498db",
                weight: favorites.includes(stand.label) ? 3 : 2,
                fillColor: favorites.includes(stand.label)
                  ? "#2ecc71"
                  : "#ecf0f1",
                fillOpacity: favorites.includes(stand.label) ? 0.7 : 0.3,
                dashArray: favorites.includes(stand.label) ? undefined : "5, 5",
              }}
              positions={stand.points}
            >
              {desktop && (
                <Tooltip direction="top">
                  <div>
                    <strong>{stand.label}</strong>
                    {stand.exhibitor?.title && (
                      <>
                        <br />
                        {stand.exhibitor.title}
                      </>
                    )}
                  </div>
                </Tooltip>
              )}
              <Popup closeButton={true}>
                <div>
                  <p>
                    <strong>
                      {stand.exhibitor?.title || "Exhibitor Information"}
                    </strong>
                  </p>
                  <p>📍{stand.label}</p>

                  <div>
                    {stand.exhibitor?.booths &&
                      stand.exhibitor.booths.length > 1 && (
                        <>
                          <br />
                          <strong>Additional booths:</strong>{" "}
                          {stand.exhibitor.booths
                            .filter((b: string) => b !== stand.label)
                            .join(", ")}
                        </>
                      )}
                  </div>

                  <p>
                    <button
                      type="button"
                      onClick={() => {
                        toggleFavorite(stand.label);
                      }}
                    >
                      {favorites.includes(stand.label)
                        ? "❌ Remove from My Plan"
                        : "⭐ Add to My Plan"}
                    </button>
                  </p>
                </div>
              </Popup>
            </Polygon>
          ))}
        </MapContainer>
      )}
    </div>
  );
};
