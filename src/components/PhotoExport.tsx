"use client";

import { motion } from "framer-motion";
import { Download, Images, RefreshCw, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities } from "@/lib/azureDb";

/**
 * Batch photo export. Pick a batch, see how many proof photos it holds, download
 * them as one zip foldered by member — or pull a single member when the whole
 * batch is more than the connection (or the host's function timeout) will take.
 */

interface MemberCount {
  userId: string;
  name: string;
  photos: number;
}

export function PhotoExport() {
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState("");
  const [summary, setSummary] = useState<{ total: number; members: MemberCount[] } | null>(null);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [isCounting, setIsCounting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cards = await getAllEntities("Flashcards");
        const configs = (cards || []).filter(
          (e: any) => e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH"
        );
        setBatches(configs);
      } catch {
        setError("Could not load the batch list.");
      } finally {
        setIsLoadingBatches(false);
      }
    })();
  }, []);

  const loadSummary = async (id: string) => {
    setBatchId(id);
    setSummary(null);
    setError(null);
    if (!id) return;

    setIsCounting(true);
    try {
      const res = await fetch(`/api/photos?mode=summary&batch=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSummary(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsCounting(false);
    }
  };

  /**
   * The zip is read fully before it is handed to the browser, so a mid-export
   * failure surfaces as an error here instead of saving a truncated archive the
   * admin only discovers is broken when they try to open it.
   */
  const download = async (memberId?: string, memberName?: string) => {
    const key = memberId || "all";
    setDownloading(key);
    setError(null);
    try {
      const url = `/api/photos?batch=${encodeURIComponent(batchId)}${memberId ? `&member=${encodeURIComponent(memberId)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${batchId}_${memberName ? memberName.replace(/[^\w -]/g, "") : "all"}_photos.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloading(null);
    }
  };

  const card: React.CSSProperties = {
    background: "white",
    padding: "32px",
    borderRadius: "32px",
    border: "1px solid rgba(83,55,43,0.05)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  };

  const approxMb = summary ? Math.round((summary.total * 526) / 1024) : 0;

  return (
    <div className="space-y-8">
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <Images size={20} color="#9f4022" />
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 900, color: "#53372b", margin: 0 }}>Download proof photos</h2>
            <p style={{ fontSize: "12px", color: "rgba(83,55,43,0.5)", margin: "4px 0 0" }}>
              Pick a batch to download every photo its members uploaded, in one zip foldered by member.
            </p>
          </div>
        </div>

        <label style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(83,55,43,0.4)" }}>
          Batch
        </label>
        <select
          value={batchId}
          onChange={(e) => loadSummary(e.target.value)}
          disabled={isLoadingBatches}
          style={{
            width: "100%",
            marginTop: "8px",
            padding: "16px",
            background: "#fcfaf5",
            border: "none",
            borderRadius: "16px",
            color: "#53372b",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <option value="">{isLoadingBatches ? "Loading batches…" : "Choose a batch…"}</option>
          {batches.map((b) => {
            const id = b.rowKey || b.RowKey;
            return (
              <option key={id} value={id}>
                {b.name || id}
              </option>
            );
          })}
        </select>

        {isCounting && (
          <p style={{ marginTop: "20px", fontSize: "12px", color: "rgba(83,55,43,0.5)", display: "flex", alignItems: "center", gap: "8px" }}>
            <RefreshCw size={14} className="animate-spin" /> Counting photos…
          </p>
        )}

        {error && (
          <div style={{ marginTop: "20px", padding: "16px", background: "rgba(159,64,34,0.06)", borderRadius: "16px", color: "#9f4022", fontSize: "12px", display: "flex", gap: "10px" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {summary && !isCounting && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: "24px" }}>
            <p style={{ fontSize: "13px", color: "#53372b", fontWeight: 600 }}>
              {summary.total} photo{summary.total === 1 ? "" : "s"} from {summary.members.length} member
              {summary.members.length === 1 ? "" : "s"}
              {summary.total > 0 && <span style={{ color: "rgba(83,55,43,0.45)", fontWeight: 400 }}> · roughly {approxMb} MB</span>}
            </p>

            {summary.total > 0 && (
              <>
                <button
                  onClick={() => download()}
                  disabled={downloading !== null}
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    padding: "16px",
                    background: downloading ? "rgba(159,64,34,0.5)" : "#9f4022",
                    color: "white",
                    border: "none",
                    borderRadius: "16px",
                    fontSize: "12px",
                    fontWeight: 900,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    cursor: downloading ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                  }}
                >
                  <Download size={16} />
                  {downloading === "all" ? "Preparing zip… keep this tab open" : `Download all ${summary.total} photos`}
                </button>
                <p style={{ marginTop: "10px", fontSize: "11px", color: "rgba(83,55,43,0.45)" }}>
                  A full batch takes a few minutes and is built before the save dialog appears. If it fails, download member by member below.
                </p>

                <div style={{ marginTop: "24px", borderTop: "1px solid rgba(83,55,43,0.06)", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {summary.members.map((m) => (
                    <div key={m.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                      <span style={{ fontSize: "13px", color: "#53372b" }}>{m.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "11px", color: "rgba(83,55,43,0.4)", fontWeight: 700 }}>{m.photos}</span>
                        <button
                          onClick={() => download(m.userId, m.name)}
                          disabled={downloading !== null}
                          title={`Download ${m.name}'s photos`}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(83,55,43,0.1)",
                            color: "#53372b",
                            padding: "8px 10px",
                            borderRadius: "10px",
                            cursor: downloading ? "wait" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "10px",
                            fontWeight: 700,
                          }}
                        >
                          <Download size={13} />
                          {downloading === m.userId ? "…" : "ZIP"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
