"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const KpiSizeContext = createContext({
  kpiSize: "compact",
  setKpiSize: () => {},
});

const STORAGE_KEY = "chaiflow_kpi_size";

export function KpiSizeProvider({ children }) {
  const [kpiSize, setKpiSizeState] = useState("compact");

  // Load persisted size on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === "compact" || saved === "standard" || saved === "comfortable")) {
        setKpiSizeState(saved);
        document.documentElement.setAttribute("data-kpi-size", saved);
      } else {
        document.documentElement.setAttribute("data-kpi-size", "compact");
      }
    } catch {
      document.documentElement.setAttribute("data-kpi-size", "compact");
    }
  }, []);

  const setKpiSize = (size) => {
    if (size !== "compact" && size !== "standard" && size !== "comfortable") return;
    setKpiSizeState(size);
    try {
      localStorage.setItem(STORAGE_KEY, size);
      document.documentElement.setAttribute("data-kpi-size", size);
    } catch (e) {
      console.warn("Could not save KPI size preference:", e);
    }
  };

  return (
    <KpiSizeContext.Provider value={{ kpiSize, setKpiSize }}>
      {children}
    </KpiSizeContext.Provider>
  );
}

export function useKpiSize() {
  return useContext(KpiSizeContext);
}

/**
 * Shared compact Size Selector control for headers or toolbars
 */
export function KpiSizeSelector({ showLabel = true, className = "" }) {
  const { kpiSize, setKpiSize } = useKpiSize();

  const options = [
    { id: "compact", label: "Compact", icon: "▪" },
    { id: "standard", label: "Standard", icon: "▫" },
    { id: "comfortable", label: "Comfortable", icon: "◻" },
  ];

  return (
    <div
      className={`kpi-size-selector-group ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "#F1F5F9",
        padding: "3px 4px",
        borderRadius: "8px",
        border: "1px solid var(--border-subtle)",
      }}
      title="KPI Card Size"
    >
      {showLabel && (
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: "700",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "0 4px",
          }}
        >
          Cards:
        </span>
      )}
      <div style={{ display: "flex", gap: "2px" }}>
        {options.map((opt) => {
          const isActive = kpiSize === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setKpiSize(opt.id)}
              style={{
                background: isActive ? "#FFFFFF" : "transparent",
                border: "none",
                borderRadius: "6px",
                padding: "3px 8px",
                fontSize: "0.75rem",
                fontWeight: isActive ? "700" : "500",
                color: isActive ? "var(--color-primary)" : "var(--text-muted)",
                cursor: "pointer",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
              title={`Switch KPI cards to ${opt.label} size`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
