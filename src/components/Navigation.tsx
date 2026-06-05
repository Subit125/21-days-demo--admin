"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const tabs = [
  { id: "validations", label: "Validations" },
  { id: "tasks", label: "Tasks" },
  { id: "teams", label: "Teams" },
  { id: "challenges", label: "Challenges" },
  { id: "analytics", label: "Analytics" },
];

export function Navigation() {
  const [activeTab, setActiveTab] = useState("validations");

  return (
    <nav className="flex justify-center my-8">
      <div className="bg-white/40 backdrop-blur-md p-1.5 rounded-full border border-white/40 shadow-sm flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pill-nav-item relative z-10 ${
              activeTab === tab.id ? "text-hb-brown" : "text-hb-brown/50"
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 bg-white rounded-full -z-10 shadow-sm"
                transition={{ type: "spring", duration: 0.5 }}
              />
            )}
            <span className="text-sm font-semibold tracking-wide">
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
