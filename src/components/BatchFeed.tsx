"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, X, Clock, Rss } from "lucide-react";
import { getAllEntities, TABLES, upsertEntity } from "@/lib/azureDb";

const isVideo = (url: string) => /\.(mp4|webm|ogg|mov)$/i.test(url);

interface FeedPost {
  id: string;
  user_id: string;
  file_url?: string;
  created_at: string;
  profiles?: any;
  tasks?: any;
  flashcards?: any;
  batch_name?: string;
}

export function BatchFeed({ batchId }: { batchId: string }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [approvedSubs, setApprovedSubs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 10000);
    return () => clearInterval(interval);
  }, [batchId]);

  const fetchFeed = async () => {
    try {
      const [allSubs, allProfiles, allTasks, allCards] = await Promise.all([
        getAllEntities(TABLES.SUBMISSIONS),
        getAllEntities(TABLES.PROFILES),
        getAllEntities(TABLES.TASKS),
        getAllEntities(TABLES.FLASHCARDS),
      ]);

      const flashData = allCards || [];
      const batches = flashData.filter(
        (e: any) => e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH"
      );

      const enrich = (sub: any) => {
        const sId = sub.rowKey || sub.RowKey || sub.id;
        const profile = (allProfiles || []).find(
          (p: any) => (p.rowKey || p.RowKey || p.id) === sub.user_id
        );
        if (profile?.batch_id !== batchId) return null;
        const task = (allTasks || []).find(
          (t: any) => (t.rowKey || t.RowKey || t.id) === sub.task_id
        );
        const card = flashData.find(
          (c: any) => (c.rowKey || c.RowKey || c.id) === sub.flashcard_id
        );
        const batch = batches.find(
          (b: any) => (b.rowKey || b.RowKey || b.id) === profile?.batch_id
        );
        return { ...sub, id: sId, profiles: profile, tasks: task, flashcards: card, batch_name: batch?.name || "Unknown Batch" };
      };

      const allApproved = (allSubs || [])
        .filter((sub: any) => sub.status === "approved")
        .map(enrich)
        .filter(Boolean);

      setApprovedSubs(allApproved);
      setPosts(
        allApproved
          .filter((sub: any) => sub.published_to_feed === true || sub.published_to_feed === "true")
          .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      );
      setIsLoading(false);
    } catch (err) {
      console.error("BatchFeed fetch error:", err);
    }
  };

  const handleToggleFeed = async (sub: any, publish: boolean) => {
    try {
      const { profiles, tasks, flashcards, batch_name, id: _id, ...clean } = sub;
      await upsertEntity(TABLES.SUBMISSIONS, {
        ...clean,
        published_to_feed: publish,
        feed_published_at: publish ? new Date().toISOString() : null,
      });
      fetchFeed();
    } catch (e: any) {
      console.error("Feed Toggle Error:", e);
      alert(`Failed to update feed: ${e.message}`);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <div
          style={{
            width: "32px",
            height: "32px",
            border: "3px solid rgba(159, 64, 34, 0.15)",
            borderTop: "3px solid #9f4022",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div>

      {/* Feed Curation */}
      {approvedSubs.length > 0 && (
        <div style={{ marginBottom: "48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <Rss size={16} color="#9f4022" />
            <h3 style={{ margin: 0, fontSize: "13px", fontWeight: "900", color: "#53372b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Feed Curation</h3>
            <span style={{ fontSize: "11px", color: "rgba(83,55,43,0.4)", fontWeight: "bold" }}>— toggle which approved posts appear in the batch feed</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {approvedSubs.map((sub: any) => {
              const isPublished = sub.published_to_feed === true || sub.published_to_feed === "true";
              const consented = sub.consent_to_feed === true || sub.consent_to_feed === "true";
              return (
                <div
                  key={sub.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    background: "white", borderRadius: "14px", padding: "12px 16px",
                    border: `1px solid ${isPublished ? "rgba(111,142,124,0.3)" : "rgba(83,55,43,0.08)"}`,
                  }}
                >
                  <div style={{ width: "48px", height: "48px", borderRadius: "10px", overflow: "hidden", background: "rgba(83,55,43,0.06)", flexShrink: 0 }}>
                    {sub.file_url && !isVideo(sub.file_url) ? (
                      <img src={sub.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                        {sub.file_url ? "🎬" : "📄"}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: "900", color: "#53372b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sub.profiles?.name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: "11px", color: "rgba(83,55,43,0.45)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sub.tasks?.title || sub.flashcards?.text || "Submission"} · {sub.profiles?.team_name || "No Clan"}
                    </p>
                  </div>
                  <span style={{
                    fontSize: "10px", fontWeight: "900", padding: "3px 8px", borderRadius: "6px",
                    textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0,
                    color: consented ? "#6f8e7c" : "rgba(83,55,43,0.3)",
                    background: consented ? "rgba(111,142,124,0.1)" : "rgba(83,55,43,0.06)",
                  }}>
                    {consented ? "Feed OK" : "Feed No"}
                  </span>
                  {isPublished && (
                    <span style={{ fontSize: "10px", fontWeight: "900", color: "#6f8e7c", background: "rgba(111,142,124,0.1)", padding: "3px 8px", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                      Live
                    </span>
                  )}
                  <button
                    onClick={() => (consented || isPublished) ? handleToggleFeed(sub, !isPublished) : undefined}
                    disabled={!consented && !isPublished}
                    title={!consented && !isPublished ? "Client did not consent to feed" : undefined}
                    style={{
                      padding: "8px 16px", borderRadius: "8px", border: "none",
                      fontSize: "11px", fontWeight: "bold", flexShrink: 0,
                      cursor: (!consented && !isPublished) ? "not-allowed" : "pointer",
                      opacity: (!consented && !isPublished) ? 0.4 : 1,
                      background: isPublished ? "rgba(210,116,64,0.1)" : "#9f4022",
                      color: isPublished ? "#d27440" : "white",
                    }}
                  >
                    {isPublished ? "✕ Remove" : "↑ Publish"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feed header */}
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: "24px", color: "#53372b", margin: 0 }}>
          Batch Feed
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "rgba(83, 55, 43, 0.4)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {posts.length} post{posts.length !== 1 ? "s" : ""} · visible only to this batch
        </p>
      </div>

      {/* Instagram-style grid */}
      {posts.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(83, 55, 43, 0.35)" }}>
          <ImageIcon size={48} style={{ marginBottom: "16px", opacity: 0.25 }} />
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            No posts published yet
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "12px", maxWidth: "280px", marginLeft: "auto", marginRight: "auto" }}>
            Use Feed Curation above to publish approved posts
          </p>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {posts.map((post) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(83,55,43,0.14)" }}
            onClick={() => setSelectedPost(post)}
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              background: "white",
              boxShadow: "0 2px 10px rgba(83, 55, 43, 0.07)",
              cursor: "pointer",
              border: "1px solid rgba(83, 55, 43, 0.06)",
            }}
          >
            <div
              style={{
                height: "220px",
                background: "rgba(83, 55, 43, 0.04)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {post.file_url ? (
                isVideo(post.file_url) ? (
                  <video
                    src={post.file_url}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted
                  />
                ) : (
                  <img
                    src={post.file_url}
                    alt="Post"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  <ImageIcon size={32} style={{ opacity: 0.2 }} />
                </div>
              )}
              {post.file_url && isVideo(post.file_url) && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    background: "rgba(0,0,0,0.5)",
                    borderRadius: "6px",
                    padding: "2px 6px",
                    fontSize: "10px",
                    color: "white",
                    fontWeight: "bold",
                  }}
                >
                  VIDEO
                </div>
              )}
            </div>

            <div style={{ padding: "12px 14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "3px",
                }}
              >
                <span
                  style={{ fontSize: "13px", fontWeight: "900", color: "#53372b" }}
                >
                  {post.profiles?.name || "Unknown"}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "rgba(83, 55, 43, 0.35)",
                    fontWeight: "bold",
                  }}
                >
                  {new Date(post.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "11px",
                  color: "rgba(83, 55, 43, 0.45)",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {post.profiles?.team_name || "Independent"}
              </p>
              {(post.tasks?.title || post.flashcards?.text) && (
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: "11px",
                    color: "rgba(83, 55, 43, 0.4)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {post.tasks?.title || post.flashcards?.text}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedPost && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPost(null)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(23, 15, 12, 0.95)",
                backdropFilter: "blur(10px)",
              }}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                position: "relative",
                display: "flex",
                borderRadius: "20px",
                overflow: "hidden",
                maxWidth: "900px",
                width: "100%",
                background: "white",
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: "black",
                  minHeight: "400px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selectedPost.file_url &&
                  (isVideo(selectedPost.file_url) ? (
                    <video
                      src={selectedPost.file_url}
                      controls
                      style={{ maxWidth: "100%", maxHeight: "80vh" }}
                    />
                  ) : (
                    <img
                      src={selectedPost.file_url}
                      alt="Post"
                      style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }}
                    />
                  ))}
              </div>

              <div
                style={{
                  width: "270px",
                  minWidth: "270px",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "20px",
                      paddingBottom: "20px",
                      borderBottom: "1px solid rgba(83,55,43,0.08)",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "#9f4022",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontWeight: "bold",
                        fontSize: "14px",
                        flexShrink: 0,
                      }}
                    >
                      {(selectedPost.profiles?.name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p
                        style={{ margin: 0, fontSize: "13px", fontWeight: "900", color: "#53372b" }}
                      >
                        {selectedPost.profiles?.name}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "11px",
                          color: "rgba(83,55,43,0.4)",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                        }}
                      >
                        {selectedPost.profiles?.team_name || "Independent"}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(159, 64, 34, 0.05)",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "10px",
                        color: "rgba(83,55,43,0.4)",
                        fontWeight: "bold",
                        textTransform: "uppercase",
                      }}
                    >
                      Task
                    </p>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: "bold", color: "#53372b" }}>
                      {selectedPost.tasks?.title || selectedPost.flashcards?.text || "Submission"}
                    </p>
                  </div>

                  {selectedPost.tasks?.points && (
                    <div
                      style={{
                        background: "rgba(111, 142, 124, 0.08)",
                        padding: "10px 14px",
                        borderRadius: "10px",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 4px",
                          fontSize: "10px",
                          color: "rgba(83,55,43,0.4)",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                        }}
                      >
                        Points Earned
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "20px",
                          fontWeight: "900",
                          color: "#6f8e7c",
                        }}
                      >
                        +{selectedPost.tasks.points}
                      </p>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(83,55,43,0.3)",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Clock size={12} />
                  {new Date(selectedPost.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              <button
                onClick={() => setSelectedPost(null)}
                style={{
                  position: "absolute",
                  top: "14px",
                  right: "14px",
                  background: "rgba(0,0,0,0.45)",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={15} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
