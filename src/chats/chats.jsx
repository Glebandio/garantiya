import './Chats.scss';
import ChatElement from "./chatElement.jsx";
import {useEffect, useState, useRef} from "react";

function Chats() {
    const token = localStorage.getItem('token');
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [selectedChatData, setSelectedChatData] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [myId, setMyId] = useState(0);
    const [messageText, setMessageText] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [typingUsers, setTypingUsers] = useState({});

    const ws = useRef(null);
    const reconnectTimeout = useRef(null);
    const isInitialized = useRef(false);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef({});
    const lastTypingSentRef = useRef(0);
    const TYPING_DEBOUNCE = 10000;

    // загрузка чатов и пользователя
    useEffect(() => {
        const fetchChats = async () => {
            if (!token) return;

            try {
                const [meRes, chatsRes] = await Promise.all([
                    fetch('https://garantbe.ru/accounts/me/', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch('https://garantbe.ru/chats/?limit=20', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                const meData = await meRes.json();
                const chatsData = await chatsRes.json();

                setMyId(meData.id);
                setChats(chatsData.results || []);

                if (!isInitialized.current) {
                    initializeWebSocket();
                    isInitialized.current = true;
                }

            } catch (e) {
                console.error("Ошибка при загрузке чатов:", e);
            }
        };

        fetchChats();
        return () => {
            ws.current?.close();
            clearTimeout(reconnectTimeout.current);
        };
    }, [token]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // инициализация сокета
    const initializeWebSocket = () => {
        if (!token) return;
        ws.current = new WebSocket(`wss://garantbe.ru/ws/user_chats/?token=${token}`);

        ws.current.onopen = () => {
            console.log("✅ WebSocket подключен");
            setIsConnected(true);
            if (selectedChat) joinChat(selectedChat);
        };

        ws.current.onmessage = (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch (err) {
                console.error("Ошибка парсинга:", err);
                return;
            }

            console.log("📩 Пришло сообщение из WS:", data);
            handleWebSocketMessage(data);
        };

        ws.current.onclose = () => {
            console.warn("⚠️ WebSocket закрыт, пробуем переподключиться...");
            setIsConnected(false);
            reconnectTimeout.current = setTimeout(initializeWebSocket, 3000);
        };

        ws.current.onerror = (err) => {
            console.error("Ошибка WebSocket:", err);
            setIsConnected(false);
        };
    };

    // обработка всех типов событий
    const handleWebSocketMessage = (data) => {
        switch (data.type) {
            case "chat_message":
                if (data.message.chat_id === selectedChat) {
                    setMessages(prev => {
                        const exists = prev.some(m => m.id === data.message.id);
                        if (exists) return prev;
                        return [...prev, data.message].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    });
                }
                break;
            case "typing":
                if (data.chat_id === selectedChat && data.user_id !== myId) {
                    setTypingUsers(prev => ({
                        ...prev,
                        [data.user_id]: { timestamp: Date.now() }
                    }));
                    clearTimeout(typingTimeoutRef.current[data.user_id]);
                    typingTimeoutRef.current[data.user_id] = setTimeout(() => {
                        setTypingUsers(prev => {
                            const updated = { ...prev };
                            delete updated[data.user_id];
                            return updated;
                        });
                    }, 3000);
                }
                break;
            default:
                console.log("🟡 Неизвестный тип события:", data.type);
        }
    };

    // отправка действий по сокету
    const sendWebSocketAction = (action, payload = {}) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            const msg = { action, ...payload };
            ws.current.send(JSON.stringify(msg));
            console.log("➡️ Отправлено действие:", msg);
            return true;
        } else {
            console.error("❌ WebSocket не подключен");
            return false;
        }
    };

    const joinChat = (chatId) => {
        if (!chatId) return;
        sendWebSocketAction("join_chat", { chat_id: chatId });
    };

    // загрузка сообщений
    const fetchMessages = async (chatId) => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`https://garantbe.ru/chats/${chatId}/messages/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setMessages((data.results || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
            setSelectedChat(chatId);
            joinChat(chatId);
        } catch (e) {
            console.error("Ошибка при загрузке сообщений:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleChatSelect = (chatId) => {
        fetchMessages(chatId);
    };

    // отправка сообщения
    const sendMessage = () => {
        if (!messageText.trim() || !selectedChat) return;
        const text = messageText.trim();

        const sent = sendWebSocketAction("send_message", {
            chat_id: selectedChat,
            text
        });

        if (sent) {
            // локально добавляем сообщение, чтобы сразу отобразилось
            const tempMsg = {
                id: `temp-${Date.now()}`,
                chat_id: selectedChat,
                sender_id: myId,
                text,
                created_at: new Date().toISOString(),
            };
            setMessages(prev => [...prev, tempMsg]);
            setMessageText('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setMessageText(value);
        if (value.trim().length > 0) sendTyping(true);
    };

    const sendTyping = (isTyping = true) => {
        if (!selectedChat) return;
        const now = Date.now();
        if (isTyping && now - lastTypingSentRef.current < TYPING_DEBOUNCE) return;
        lastTypingSentRef.current = now;
        sendWebSocketAction("typing", { chat_id: selectedChat, is_typing: isTyping });
    };

    const typingText =
        Object.keys(typingUsers).length > 0 ? "Собеседник печатает..." : null;

    return (
        <div className="chats">
            <div className="chats__container">
                <div className="chats__logo">
                    <img className="chats__logo-image" src="/public/mini-logo.svg" alt=""/>
                    <p className="chats__logo-name">Техническая поддержка</p>
                </div>

                <div className="chats__list">
                    {chats.map(chat => (
                        <ChatElement
                            key={chat.id}
                            chat={chat}
                            isSelected={selectedChat === chat.id}
                            onSelect={() => handleChatSelect(chat.id)}
                        />
                    ))}
                </div>

                <div className={`websocket-status ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                </div>
            </div>

            <div className="chats__window">
                {selectedChat ? (
                    <>
                        <div className="chats__messages">
                            {messages.map(m => (
                                <div
                                    key={m.id}
                                    className={`message ${m.sender_id === myId ? 'message--own' : 'message--other'}`}
                                >
                                    <div className="message__content">
                                        <div className="message__text">{m.text}</div>
                                        <div className="message__time">
                                            {new Date(m.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {typingText && <div className="typing-indicator">{typingText}</div>}
                            <div ref={messagesEndRef}/>
                        </div>

                        <div className="chats__input">
                            <input
                                className="chats__input-row"
                                placeholder="Сообщение..."
                                value={messageText}
                                onChange={handleInputChange}
                                onKeyPress={handleKeyPress}
                            />
                            <button
                                className="chats__input-sent"
                                onClick={sendMessage}
                                disabled={!messageText.trim()}
                            >
                                ➤
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="select-chat">Выберите чат для просмотра сообщений</div>
                )}
            </div>
        </div>
    );
}

export default Chats;
