import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Select,
  MenuItem,
  FormControl,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import "./styles/pdf-chat-vars.css";
import "./styles/pdf-chat.css";

const THEME_KEY = "papermind-theme";
const AUTH_TOKEN_KEY = "papermind-auth-token";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMessageContent(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split("\n");
  const parts = [];
  let inList = false;

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[*-]\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${bulletMatch[1]}</li>`);
      continue;
    }

    if (inList) {
      parts.push("</ul>");
      inList = false;
    }

    const h3Match = line.match(/^###\s+(.*)$/);
    if (h3Match) {
      parts.push(`<h3>${h3Match[1]}</h3>`);
      continue;
    }

    const h2Match = line.match(/^##\s+(.*)$/);
    if (h2Match) {
      parts.push(`<h2>${h2Match[1]}</h2>`);
      continue;
    }

    const h1Match = line.match(/^#\s+(.*)$/);
    if (h1Match) {
      parts.push(`<h1>${h1Match[1]}</h1>`);
      continue;
    }

    if (line.trim() === "") {
      parts.push("<br>");
    } else {
      parts.push(`<p>${line}</p>`);
    }
  }

  if (inList) {
    parts.push("</ul>");
  }

  return parts
    .join("")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

async function readJsonSafe(response) {
  const rawText = await response.text();
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function CircularProgressWithLabel({ value, label }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, mt: 1 }}>
      <Box sx={{ position: "relative", display: "inline-flex" }}>
        <CircularProgress variant="determinate" value={value} size={62} />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="caption" component="div" color="text.secondary">
            {`${Math.round(value)}%`}
          </Typography>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function App() {
  const initialTheme = useMemo(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme) return storedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }, []);

  const [theme, setTheme] = useState(initialTheme);
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [authIdentifier, setAuthIdentifier] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState({ open: false, message: "" });

  const [sessionId, setSessionId] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadStatusType, setUploadStatusType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [uploadSteps, setUploadSteps] = useState([]);
  const [showUpload, setShowUpload] = useState(true);
  const [messageInput, setMessageInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isTurningPage, setIsTurningPage] = useState(false);
  const [previousChats, setPreviousChats] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [openingConversationId, setOpeningConversationId] = useState("");
  const [selectedConversationIds, setSelectedConversationIds] = useState([]);
  const [historySelectMode, setHistorySelectMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState([]);
  const [deleteProgress, setDeleteProgress] = useState({
    active: false,
    total: 0,
    completed: 0,
    currentLabel: "",
  });
  const [deleteError, setDeleteError] = useState("");
  const [uploadProgressValue, setUploadProgressValue] = useState(0);

  const fileInputRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const authTokenRef = useRef(localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const authNoticeTimerRef = useRef(null);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (authNoticeTimerRef.current) {
        clearTimeout(authNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (!authTokenRef.current) {
        setAuthChecked(true);
        return;
      }

      try {
        const response = await apiFetch("/auth/me");
        const data = await readJsonSafe(response);
        if (response.ok && data?.data) {
          setAuthUser(data.data);
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      } finally {
        setAuthChecked(true);
      }
    };

    bootstrapAuth();
  }, []);

  useEffect(() => {
    if (authUser) {
      fetchPreviousChats();
    }
  }, [authUser]);

  const apiFetch = async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (authTokenRef.current) {
      headers.Authorization = `Bearer ${authTokenRef.current}`;
    }
    return fetch(url, { ...options, headers });
  };

  const clearHistorySelection = () => {
    setSelectedConversationIds([]);
    setHistorySelectMode(false);
  };

  const clearAuth = () => {
    authTokenRef.current = "";
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthUser(null);
    setAuthIdentifier("");
    setAuthPassword("");
    setAuthError("");
    setHistoryDrawerOpen(false);
    setDeleteDialogOpen(false);
    setDeleteTargets([]);
    setDeleteError("");
    clearHistorySelection();
    resetToUpload();
  };

  const showAuthNotice = (message) => {
    setAuthNotice({ open: true, message });
    if (authNoticeTimerRef.current) {
      clearTimeout(authNoticeTimerRef.current);
    }
    authNoticeTimerRef.current = setTimeout(() => {
      setAuthNotice((prev) => ({ ...prev, open: false }));
    }, 2200);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const identifier = authIdentifier.trim();
    const password = authPassword;

    if (!identifier || !password) {
      setAuthError("Identifier and password are required.");
      return;
    }

    setAuthSubmitting(true);
    setAuthError("");

    try {
      const endpoint = authMode === "signup" ? "/auth/signup" : "/auth/signin";
      const currentMode = authMode;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await readJsonSafe(response);
      if (!response.ok) {
        setAuthError(data?.message || "Authentication failed.");
        return;
      }

      const token = data?.data?.token;
      const user = data?.data?.user;
      if (!token || !user) {
        setAuthError("Invalid authentication response.");
        return;
      }

      authTokenRef.current = token;
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      setAuthUser(user);
      setAuthPassword("");
      setAuthIdentifier(user.identifier || identifier);
      setAuthMode("signin");
      setUploadStatus("");
      setUploadStatusType("");
      showAuthNotice(
        currentMode === "signup"
          ? "Signed up successfully. You are now logged in."
          : "Logged in successfully.",
      );
    } catch (error) {
      setAuthError(error?.message || "Unable to authenticate right now.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const stopUploadStatusPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const refreshUploadStatus = async (uploadId) => {
    if (!uploadId) return;
    try {
      const response = await apiFetch(
        `/pdf/upload-status/${encodeURIComponent(uploadId)}`,
      );
      if (!response.ok) return;
      const data = await response.json();

      if (Array.isArray(data.steps) && data.steps.length > 0) {
        setUploadSteps(data.steps);
        const estimated = Math.min(95, Math.max(10, data.steps.length * 12));
        setUploadProgressValue(estimated);
      }
      if (data.done) {
        setUploadProgressValue(100);
        stopUploadStatusPolling();
      }
    } catch {
      // best effort polling
    }
  };

  const startUploadStatusPolling = (uploadId) => {
    stopUploadStatusPolling();
    refreshUploadStatus(uploadId);
    pollingIntervalRef.current = setInterval(() => {
      refreshUploadStatus(uploadId);
    }, 700);
  };

  const resetToUpload = () => {
    stopUploadStatusPolling();
    setShowUpload(true);
    setUploadStatus("");
    setUploadStatusType("");
    setMessages([]);
    setMessageInput("");
    setSessionId("");
    setChatHistory([]);
    setUploading(false);
    setSending(false);
    setPreviewText("");
    setUploadSteps([]);
    setActiveConversationId("");
    setIsBotTyping(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadAnotherClick = () => {
    if (isTurningPage) return;
    setIsTurningPage(true);
    setTimeout(() => {
      resetToUpload();
    }, 360);
    setTimeout(() => {
      setIsTurningPage(false);
    }, 760);
  };

  const setStatus = (message, type = "") => {
    setUploadStatus(message);
    setUploadStatusType(type);
  };

  const fetchPreviousChats = async () => {
    setHistoryLoading(true);
    try {
      const response = await apiFetch("/chats");
      const data = await response.json();
      if (response.ok) {
        const chats = data.data || [];
        setPreviousChats(chats);
        setSelectedConversationIds((prev) =>
          prev.filter((id) => chats.some((chat) => chat.id === id)),
        );
      }
    } catch {
      // best effort
    } finally {
      setHistoryLoading(false);
    }
  };

  const openPreviousChat = async (conversationId) => {
    if (historySelectMode || deleteProgress.active) return;
    setOpeningConversationId(conversationId);
    try {
      const response = await apiFetch(
        `/chats/${encodeURIComponent(conversationId)}/resume`,
        {
          method: "POST",
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Failed to open conversation", "error");
        return;
      }

      const loadedMessages = (data.data?.messages || []).map((item) => ({
        role: item.sender === "user" ? "user" : "bot",
        content: item.content || "",
      }));

      setSessionId(data.data?.sessionId || "");
      setActiveConversationId(conversationId);
      setChatHistory(data.data?.history || []);
      setMessages(loadedMessages);
      setShowUpload(false);
      setHistoryDrawerOpen(false);
      setStatus("Conversation loaded. You can continue chatting.", "success");
    } catch (error) {
      setStatus(`Error loading previous chat: ${error.message}`, "error");
    } finally {
      setOpeningConversationId("");
    }
  };

  const toggleConversationSelection = (conversationId) => {
    setSelectedConversationIds((prev) => {
      if (prev.includes(conversationId)) {
        return prev.filter((id) => id !== conversationId);
      }
      return [...prev, conversationId];
    });
  };

  const promptDeleteConversations = (conversationIds) => {
    const normalized = Array.from(
      new Set((conversationIds || []).filter(Boolean)),
    );
    if (!normalized.length || deleteProgress.active) return;
    setDeleteTargets(normalized);
    setDeleteError("");
    setDeleteDialogOpen(true);
  };

  const deleteConversationById = async (conversationId) => {
    const response = await apiFetch(`/chats/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
    });
    const data = await readJsonSafe(response);
    if (!response.ok) {
      throw new Error(data?.message || "Failed to delete conversation.");
    }
  };

  const confirmDeleteConversations = async () => {
    if (!deleteTargets.length) return;

    setDeleteError("");
    setDeleteProgress({
      active: true,
      total: deleteTargets.length,
      completed: 0,
      currentLabel: "Preparing deletion...",
    });

    const failed = [];
    const targetSet = new Set(deleteTargets);

    for (let index = 0; index < deleteTargets.length; index += 1) {
      const conversationId = deleteTargets[index];
      const chatTitle = previousChats.find((chat) => chat.id === conversationId)?.title || "Conversation";

      setDeleteProgress((prev) => ({
        ...prev,
        currentLabel: `Deleting: ${chatTitle}`,
      }));

      try {
        await deleteConversationById(conversationId);
      } catch (error) {
        failed.push(error?.message || `Failed to delete ${chatTitle}`);
      }

      setDeleteProgress((prev) => ({
        ...prev,
        completed: index + 1,
      }));
    }

    if (targetSet.has(activeConversationId)) {
      resetToUpload();
    }

    await fetchPreviousChats();
    setSelectedConversationIds((prev) =>
      prev.filter((id) => !targetSet.has(id)),
    );
    setDeleteTargets([]);
    setDeleteDialogOpen(false);
    setDeleteProgress({
      active: false,
      total: 0,
      completed: 0,
      currentLabel: "",
    });

    if (failed.length) {
      setDeleteError(failed[0]);
      setStatus(failed[0], "error");
      return;
    }

    const deletedCount = deleteTargets.length;
    const successMessage = deletedCount === 1
      ? "Conversation deleted successfully."
      : `${deletedCount} conversations deleted successfully.`;
    setStatus(successMessage, "success");
    showAuthNotice(successMessage);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setStatus("Please select a PDF file", "error");
      return;
    }

    const formData = new FormData();
    formData.append("pdf", file);

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploadSteps([]);
    setStatus("Uploading and processing PDF...", "");
    setUploading(true);
    setUploadProgressValue(8);
    startUploadStatusPolling(uploadId);

    try {
      const response = await apiFetch("/pdf/upload", {
        method: "POST",
        headers: {
          "x-upload-id": uploadId,
        },
        body: formData,
      });

      const data = await response.json();
      await refreshUploadStatus(data.uploadId || uploadId);

      if (response.ok) {
        setUploadProgressValue(100);
        setStatus(
          data.message || "PDF uploaded and processed successfully!",
          "success",
        );
        setSessionId(data.sessionId);
        setActiveConversationId(data.conversationId || "");

        if (data.text) {
          setPreviewText(data.text);
        }

        setShowUpload(false);
        setMessages([
          {
            role: "bot",
            content:
              "Your PDF is ready. Ask a question and I will write the summary on notebook lines.",
          },
        ]);
        fetchPreviousChats();
      } else {
        setStatus(`Error: ${data.message || "Failed to process PDF"}`, "error");
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`, "error");
      setUploadProgressValue(0);
    } finally {
      stopUploadStatusPolling();
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    const message = messageInput.trim();
    if (!message || sending) return;
    if (!sessionId) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content:
            "Select a conversation from the side menu or upload a PDF to start chatting.",
        },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setMessageInput("");
    setSending(true);
    setIsBotTyping(true);

    try {
      const response = await apiFetch("/pdf/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          sessionId,
          history: chatHistory,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: data.data.result.response },
        ]);
        setChatHistory(data.data.result.history || []);
      } else {
        const errorMsg = data.message || "Failed to get response";
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: `Error: ${errorMsg}` },
        ]);

        if (
          errorMsg.includes("session") ||
          errorMsg.includes("PDF not found") ||
          errorMsg.includes("file no longer exists")
        ) {
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "bot",
                content: "Please upload your PDF again to continue chatting.",
              },
            ]);
            setTimeout(resetToUpload, 2000);
          }, 1000);
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsBotTyping(false);
      setSending(false);
    }
  };

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: (theme === "dark" || theme === "london" || theme === "cyberpunk") ? "dark" : "light",
          primary: {
            main: theme === "japan" ? "#d84570" : theme === "london" ? "#5e81ac" : theme === "new-york" ? "#e07a5f" : theme === "santorini" ? "#1e75c4" : theme === "cyberpunk" ? "#06b6d4" : theme === "nordic-winter" ? "#64748b" : theme === "vintage-library" ? "#8b5a2b" : theme === "forest" ? "#4a7c47" : "#ad1f63",
          },
          secondary: {
            main: theme === "japan" ? "#b83359" : theme === "london" ? "#4c6a8d" : theme === "new-york" ? "#c46045" : theme === "santorini" ? "#165b9e" : theme === "cyberpunk" ? "#9333ea" : theme === "nordic-winter" ? "#475569" : theme === "vintage-library" ? "#634324" : theme === "forest" ? "#365e34" : "#7f2f3f",
          },
        },
      }),
    [theme],
  );

  if (!authChecked) {
    return (
      <ThemeProvider theme={muiTheme}>
        <Backdrop
          open={authNotice.open}
          sx={{ color: "#fff", zIndex: (muiTheme) => muiTheme.zIndex.drawer + 2 }}
          onClick={() => setAuthNotice((prev) => ({ ...prev, open: false }))}
        >
          <Alert severity="success" sx={{ minWidth: 280 }}>
            {authNotice.message}
          </Alert>
        </Backdrop>
        <div className="container">
          <div className="upload-section" style={{ textAlign: "center" }}>
            <CircularProgress size={28} />
            <p style={{ marginTop: 12 }}>Checking authentication...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!authUser) {
    return (
      <ThemeProvider theme={muiTheme}>
        <div className="container auth-container">
          <div className="theme-toggle-row">
            <div></div>
            <FormControl size="small" variant="outlined" sx={{ minWidth: 140 }}>
              <Select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                sx={{
                  bgcolor: "var(--input-bg)",
                  color: "var(--ink)",
                  borderRadius: "10px",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--input-border)" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--input-focus)" },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--input-focus)" }
                }}
              >
                <MenuItem value="light">Light Mode</MenuItem>
                <MenuItem value="dark">Dark Mode</MenuItem>
                <MenuItem value="new-york">New York</MenuItem>
                <MenuItem value="london">London</MenuItem>
                <MenuItem value="japan">Japan</MenuItem>
                <MenuItem value="santorini">Santorini</MenuItem>
                <MenuItem value="cyberpunk">Cyberpunk</MenuItem>
                <MenuItem value="nordic-winter">Nordic Winter</MenuItem>
                <MenuItem value="vintage-library">Vintage Library</MenuItem>
                <MenuItem value="forest">Forest</MenuItem>
              </Select>
            </FormControl>
          </div>
          <div className="brand-header">
            <img
              src="/assets/logo-reference.svg"
              alt="PaperMind logo"
              className="brand-logo"
            />
            <h1>PaperMind</h1>
          </div>
          <div className="auth-shell">
            <section className="auth-intro-card">
              <p className="auth-chip">For students and research scholars</p>
              <h2 className="auth-intro-title">Study faster with evidence-backed answers.</h2>
              <p className="auth-intro-copy">
                Upload papers, lecture notes, and reports. Ask focused questions and get
                notebook-style explanations grounded in your PDF content.
              </p>
              <div className="auth-metrics">
                <div className="auth-metric">
                  <span>01</span>
                  <p>Extract key findings from dense papers in minutes.</p>
                </div>
                <div className="auth-metric">
                  <span>02</span>
                  <p>Keep context across follow-up questions and revisions.</p>
                </div>
                <div className="auth-metric">
                  <span>03</span>
                  <p>Turn long documents into practical, study-ready notes.</p>
                </div>
              </div>
            </section>

            <div className="upload-section auth-form-card">
              <h2 className="auth-form-title">
                {authMode === "signup" ? "Create Account" : "Sign In"}
              </h2>
              <p className="auth-form-subtitle">
                {authMode === "signup"
                  ? "Start your research workspace."
                  : "Continue your reading session."}
              </p>
              <form onSubmit={handleAuthSubmit}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Username or Email"
                    value={authIdentifier}
                    onChange={(e) => setAuthIdentifier(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />
                  <Button
                    type="submit"
                    className="mui-note-btn"
                    variant="contained"
                    disableElevation
                    disabled={authSubmitting}
                  >
                    {authSubmitting
                      ? "Please wait..."
                      : authMode === "signup"
                        ? "Sign Up"
                        : "Sign In"}
                  </Button>
                </Stack>
              </form>
              {authError && (
                <Alert severity="error" sx={{ mt: 1.25 }}>
                  {authError}
                </Alert>
              )}
              <div className="status auth-switch-row">
                {authMode === "signup" ? "Already have an account?" : "New user?"}{" "}
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  onClick={() => {
                    setAuthMode((prev) =>
                      prev === "signup" ? "signin" : "signup",
                    );
                    setAuthError("");
                  }}
                >
                  {authMode === "signup" ? "Sign in" : "Create one"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
      <ThemeProvider theme={muiTheme}>
        <Backdrop
          open={authNotice.open}
          sx={{ color: "#fff", zIndex: (muiTheme) => muiTheme.zIndex.drawer + 2 }}
          onClick={() => setAuthNotice((prev) => ({ ...prev, open: false }))}
        >
          <Alert severity="success" sx={{ minWidth: 280 }}>
            {authNotice.message}
          </Alert>
        </Backdrop>
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          if (deleteProgress.active) return;
          setDeleteDialogOpen(false);
          setDeleteError("");
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {deleteProgress.active ? "Deleting Conversations" : "Confirm Deletion"}
        </DialogTitle>
        <DialogContent>
          {!deleteProgress.active && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {deleteTargets.length === 1
                ? "Delete this conversation and its related files from storage and Firestore?"
                : `Delete ${deleteTargets.length} conversations and their related files from storage and Firestore?`}
            </Typography>
          )}
          {deleteProgress.active && (
            <Box sx={{ mt: 1, display: "grid", gap: 1 }}>
              <Typography variant="body2">
                {deleteProgress.currentLabel || "Deleting..."}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={
                  deleteProgress.total > 0
                    ? (deleteProgress.completed / deleteProgress.total) * 100
                    : 0
                }
              />
              <Typography variant="caption" color="text.secondary">
                {`${deleteProgress.completed} / ${deleteProgress.total} completed`}
              </Typography>
            </Box>
          )}
          {!!deleteError && !deleteProgress.active && (
            <Alert severity="error" sx={{ mt: 1.25 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (deleteProgress.active) return;
              setDeleteDialogOpen(false);
            }}
            disabled={deleteProgress.active}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeleteConversations}
            disabled={deleteProgress.active || deleteTargets.length === 0}
          >
            {deleteProgress.active ? "Deleting..." : "Confirm Delete"}
          </Button>
        </DialogActions>
      </Dialog>
      <Drawer
        anchor="left"
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
      >
        <Box sx={{ width: 340 }} role="presentation">
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="h6">Conversations</Typography>
            <Typography variant="body2" color="text.secondary">
              {authUser.identifier}
            </Typography>
          </Box>
          <Divider />
          <List>
            <ListItemButton onClick={() => setHistoryExpanded((prev) => !prev)}>
              <ListItemText primary="Previous Chats" />
              {historyExpanded ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
            <Collapse in={historyExpanded} timeout="auto" unmountOnExit>
              <Box sx={{ px: 1.5, pb: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant={historySelectMode ? "contained" : "outlined"}
                  onClick={() => {
                    if (deleteProgress.active) return;
                    if (historySelectMode) {
                      clearHistorySelection();
                    } else {
                      setHistorySelectMode(true);
                    }
                  }}
                  disabled={deleteProgress.active || historyLoading || previousChats.length === 0}
                >
                  {historySelectMode ? "Cancel Select" : "Select Chats"}
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  onClick={() => promptDeleteConversations(selectedConversationIds)}
                  disabled={
                    deleteProgress.active ||
                    historyLoading ||
                    !historySelectMode ||
                    selectedConversationIds.length === 0
                  }
                >
                  Delete Selected
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="contained"
                  onClick={() => promptDeleteConversations(previousChats.map((chat) => chat.id))}
                  disabled={deleteProgress.active || historyLoading || previousChats.length === 0}
                >
                  Delete All
                </Button>
              </Box>
              {historyLoading && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={22} />
                </Box>
              )}
              {!historyLoading && previousChats.length === 0 && (
                <Typography sx={{ px: 2, py: 1.5 }} variant="body2">
                  No previous chats yet.
                </Typography>
              )}
              {!historyLoading &&
                previousChats.map((chat) => (
                  <ListItemButton
                    key={chat.id}
                    selected={activeConversationId === chat.id}
                    onClick={() => {
                      if (historySelectMode) {
                        toggleConversationSelection(chat.id);
                        return;
                      }
                      openPreviousChat(chat.id);
                    }}
                    disabled={openingConversationId === chat.id || deleteProgress.active}
                  >
                    {historySelectMode && (
                      <Checkbox
                        size="small"
                        checked={selectedConversationIds.includes(chat.id)}
                        onChange={() => toggleConversationSelection(chat.id)}
                        onClick={(event) => event.stopPropagation()}
                        sx={{ mr: 0.5 }}
                      />
                    )}
                    <ListItemText
                      primary={chat.title}
                      secondary={new Date(chat.createdAt).toLocaleString()}
                    />
                    {openingConversationId === chat.id && (
                      <CircularProgress size={18} />
                    )}
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(event) => {
                        event.stopPropagation();
                        promptDeleteConversations([chat.id]);
                      }}
                      disabled={deleteProgress.active || openingConversationId === chat.id}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </ListItemButton>
                ))}
            </Collapse>
          </List>
        </Box>
      </Drawer>
      <header className="main-app-header">
        <div className="main-app-header-left">PaperMind</div>
        <div className="main-app-header-right">
          <span className="status" style={{ margin: 0 }}>{authUser.identifier}</span>
          <Button size="small" variant="outlined" onClick={clearAuth}>
            Logout
          </Button>
        </div>
      </header>
      <div className={`container ${isTurningPage ? "turning-page" : ""}`}>
        <div className="theme-toggle-row">
          <IconButton
            onClick={() => setHistoryDrawerOpen(true)}
            size="small"
            aria-label="Open previous conversations"
            className="history-menu-button"
          >
            <MenuIcon />
          </IconButton>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <FormControl size="small" variant="outlined" sx={{ minWidth: 140 }}>
              <Select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                sx={{
                  bgcolor: "var(--input-bg)",
                  color: "var(--ink)",
                  borderRadius: "10px",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--input-border)" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--input-focus)" },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--input-focus)" }
                }}
              >
                <MenuItem value="light">Light Mode</MenuItem>
                <MenuItem value="dark">Dark Mode</MenuItem>
                <MenuItem value="new-york">New York</MenuItem>
                <MenuItem value="london">London</MenuItem>
                <MenuItem value="japan">Japan</MenuItem>
                <MenuItem value="santorini">Santorini</MenuItem>
                <MenuItem value="cyberpunk">Cyberpunk</MenuItem>
                <MenuItem value="nordic-winter">Nordic Winter</MenuItem>
                <MenuItem value="vintage-library">Vintage Library</MenuItem>
                <MenuItem value="forest">Forest</MenuItem>
              </Select>
            </FormControl>
          </div>
        </div>

        {showUpload && (
          <div className="upload-section" id="uploadSection">
            <h2>Upload PDF</h2>
            <form id="uploadForm" onSubmit={handleUpload}>
              <input
                ref={fileInputRef}
                type="file"
                id="pdfFile"
                accept=".pdf"
                required
              />
              <Button
                type="submit"
                id="uploadButton"
                className="mui-note-btn"
                variant="contained"
                disableElevation
                disabled={uploading}
              >
                Upload
              </Button>
            </form>
            {uploading && (
              <CircularProgressWithLabel
                value={uploadProgressValue}
                label={uploadStatus || "Processing PDF..."}
              />
            )}

            <div
              className={`status ${uploadStatusType}`.trim()}
              id="uploadStatus"
              style={{ whiteSpace: "pre-line" }}
            >
              {uploadStatus}
            </div>

            {uploadSteps.length > 0 && (
              <div className="preview" style={{ marginTop: 10 }}>
                <div className="preview-title">Processing Steps:</div>
                <div>
                  {uploadSteps.map((step, index) => (
                    <p
                      key={`${step}-${index}`}
                      style={{ margin: "0 0 0.4rem" }}
                    >
                      {index + 1}. {step}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`preview ${previewText ? "" : "hidden"}`}
              id="pdfPreview"
            >
              <div className="preview-title">Notebook Preview:</div>
              <div id="pdfPreviewContent">{previewText}</div>
            </div>
          </div>
        )}

        {!showUpload && (
          <div className="chat-section" id="chatSection">
            <h2>Chat with PDF</h2>
            <div className="chat-container" id="chatContainer">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`message ${message.role === "user" ? "user-message" : "bot-message"}`}
                >
                  <div
                    className="message-content"
                    dangerouslySetInnerHTML={{
                      __html: formatMessageContent(message.content),
                    }}
                  ></div>
                </div>
              ))}

              {isBotTyping && (
                <div className="message bot-message typing-message">
                  <div className="message-content">
                    <span
                      className="typing-dots"
                      aria-label="Paper Mind is typing"
                      role="status"
                    >
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="input-container">
              <input
                type="text"
                id="messageInput"
                placeholder="Ask a question about the PDF..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                id="sendButton"
                className="mui-note-btn"
                variant="contained"
                disableElevation
                onClick={sendMessage}
                disabled={sending}
              >
                Send
              </Button>
            </div>

            <Button
              id="backButton"
              className="mui-note-btn back-button"
              variant="contained"
              disableElevation
              onClick={handleUploadAnotherClick}
            >
              Upload Another PDF
            </Button>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}
