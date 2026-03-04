import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ThemeProvider, createTheme } from "@mui/material";
import "./styles/pdf-chat-vars.css";
import "./styles/pdf-chat.css";

const THEME_KEY = "papermind-theme";

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

export default function App() {
  const initialTheme = useMemo(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme) return storedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);

  const [theme, setTheme] = useState(initialTheme);
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

  const fileInputRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const stopUploadStatusPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const refreshUploadStatus = async (uploadId) => {
    if (!uploadId) return;
    try {
      const response = await fetch(`/pdf/upload-status/${encodeURIComponent(uploadId)}`);
      if (!response.ok) return;
      const data = await response.json();

      if (Array.isArray(data.steps) && data.steps.length > 0) {
        setUploadSteps(data.steps);
      }
      if (data.done) {
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
    startUploadStatusPolling(uploadId);

    try {
      const response = await fetch("/pdf/upload", {
        method: "POST",
        headers: { "x-upload-id": uploadId },
        body: formData,
      });

      const data = await response.json();
      await refreshUploadStatus(data.uploadId || uploadId);

      if (response.ok) {
        setStatus(data.message || "PDF uploaded and processed successfully!", "success");
        setSessionId(data.sessionId);

        if (data.text) {
          setPreviewText(data.text);
        }

        setShowUpload(false);
        setMessages([
          {
            role: "bot",
            content: "Your PDF is ready. Ask a question and I will write the summary on notebook lines.",
          },
        ]);
      } else {
        setStatus(`Error: ${data.message || "Failed to process PDF"}`, "error");
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`, "error");
    } finally {
      stopUploadStatusPolling();
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    const message = messageInput.trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setMessageInput("");
    setSending(true);
    setIsBotTyping(true);

    try {
      const response = await fetch("/pdf/chat", {
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
        setMessages((prev) => [...prev, { role: "bot", content: data.data.result.response }]);
        setChatHistory(data.data.result.history || []);
      } else {
        const errorMsg = data.message || "Failed to get response";
        setMessages((prev) => [...prev, { role: "bot", content: `Error: ${errorMsg}` }]);

        if (
          errorMsg.includes("session") ||
          errorMsg.includes("PDF not found") ||
          errorMsg.includes("file no longer exists")
        ) {
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              { role: "bot", content: "Please upload your PDF again to continue chatting." },
            ]);
            setTimeout(resetToUpload, 2000);
          }, 1000);
        }
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: "bot", content: `Error: ${error.message}` }]);
    } finally {
      setIsBotTyping(false);
      setSending(false);
    }
  };

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme === "dark" ? "dark" : "light",
          primary: { main: "#ad1f63" },
          secondary: { main: "#7f2f3f" },
        },
      }),
    [theme]
  );

  return (
    <ThemeProvider theme={muiTheme}>
    <div className={`container ${isTurningPage ? "turning-page" : ""}`}>
      <div className="theme-toggle-row">
        <label className="theme-toggle" htmlFor="themeToggle">
          <input
            type="checkbox"
            id="themeToggle"
            aria-label="Toggle dark mode"
            checked={theme === "dark"}
            onChange={(e) => setTheme(e.target.checked ? "dark" : "light")}
          />
          <span className="theme-toggle-slider"></span>
          <span id="themeToggleLabel">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </label>
      </div>

      <div className="brand-header">
        <img src="/assets/logo-minimal.svg" alt="PaperMind logo" className="brand-logo" />
        <h1>PaperMind</h1>
      </div>

      {showUpload && (
        <div className="upload-section" id="uploadSection">
          <h2>Upload PDF</h2>
          <form id="uploadForm" onSubmit={handleUpload}>
            <input ref={fileInputRef} type="file" id="pdfFile" accept=".pdf" required />
            <Button type="submit" id="uploadButton" className="mui-note-btn" variant="contained" disableElevation disabled={uploading}>
              Upload
            </Button>
            <span id="uploadLoading" className={`loading ${uploading ? "" : "hidden"}`}></span>
          </form>

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
                  <p key={`${step}-${index}`} style={{ margin: "0 0 0.4rem" }}>
                    {index + 1}. {step}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className={`preview ${previewText ? "" : "hidden"}`} id="pdfPreview">
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
                  dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
                ></div>
              </div>
            ))}

            {isBotTyping && (
              <div className="message bot-message typing-message">
                <div className="message-content">
                  <span className="typing-dots" aria-label="Paper Mind is typing" role="status">
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
            <Button id="sendButton" className="mui-note-btn" variant="contained" disableElevation onClick={sendMessage} disabled={sending}>
              Send
            </Button>
          </div>

          <Button id="backButton" className="mui-note-btn back-button" variant="contained" disableElevation onClick={handleUploadAnotherClick}>
            Upload Another PDF
          </Button>
        </div>
      )}
    </div>
    </ThemeProvider>
  );
}
