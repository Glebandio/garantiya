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
    const [userNames, setUserNames] = useState({});

    const ws = useRef(null);
    const reconnectTimeout = useRef(null);
    const isInitialized = useRef(false);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef({});
    const lastTypingSentRef = useRef(0);
    const TYPING_DEBOUNCE = 30000;

    useEffect(() => {
        const fetchChats = async () => {
            if (!token) {
                console.error('Токен не найден');
                return;
            }

            try {
                const response = await fetch('https://garantbe.ru/chats/?limit=20', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const meResponse = await fetch(`https://garantbe.ru/accounts/me/`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!meResponse.ok) {
                    throw new Error('Failed to fetch user data');
                }

                const meData = await meResponse.json();
                console.log('User data:', meData);
                setMyId(meData.id);

                if (!response.ok) {
                    throw new Error('Failed to fetch chats');
                }

                const data = await response.json();
                console.log('Chats data:', data);
                setChats(data.results || []);

                if (!isInitialized.current) {
                    initializeWebSocket();
                    isInitialized.current = true;
                }
            } catch (err) {
                console.error('Ошибка загрузки чатов:', err);
            }
        };

        fetchChats();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
            }
            Object.values(typingTimeoutRef.current).forEach(timeout => {
                clearTimeout(timeout);
            });
        };
    }, [token]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setTypingUsers(prev => {
                const updated = { ...prev };
                Object.keys(updated).forEach(userId => {
                    if (now - updated[userId].timestamp > 3000) {
                        delete updated[userId];
                    }
                });
                return updated;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const initializeWebSocket = () => {
        if (!token) {
            console.error('Token not found for WebSocket');
            return;
        }

        try {
            ws.current = new WebSocket(`wss://garantbe.ru/ws/user_chats/?token=${token}`);

            ws.current.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);

                if (selectedChat) {
                    joinChat(selectedChat);
                }
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('WebSocket message received:', data);
                    handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            ws.current.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                setIsConnected(false);

                reconnectTimeout.current = setTimeout(() => {
                    console.log('Attempting to reconnect WebSocket...');
                    initializeWebSocket();
                }, 3000);
            };

            ws.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                setIsConnected(false);
            };

        } catch (error) {
            console.error('Error initializing WebSocket:', error);
        }
    };


    useEffect(() => {
        if (isConnected && selectedChat) {
            console.log('Joining chat after reconnect or selection:', selectedChat);
            joinChat(selectedChat);
        }
    }, [isConnected, selectedChat]);

    const handleWebSocketMessage = async (data) => {
        console.log('Processing WebSocket message:', data);

        switch (data.type) {
            case 'chat_message': {
                console.log('New message received for chat:', data.message.chat_id, 'current selected:', selectedChat);

                if (data.message.chat_id) {
                    const normalized = {
                        id: data.message.id,
                        is_delivered: true,
                        is_read: false,
                        updated_at: data.message.created_at,
                        statuses_count: {
                            total: data.message.statuses?.length || 0,
                            delivered: data.message.statuses?.filter(s => s.is_delivered).length || 0,
                            read: data.message.statuses?.filter(s => s.is_read).length || 0,
                        },
                        files: data.message.files || [],
                        text: data.message.text,
                        created_at: data.message.created_at,
                        is_sent: true,
                        chat: data.message.chat_id,
                        sender: data.message.sender_id,
                    };

                    setMessages(prev => {
                        if (prev.some(msg => msg.id === normalized.id)) {
                            return prev;
                        }

                        const newMessages = [...prev, normalized].sort(
                            (a, b) => new Date(a.created_at) - new Date(b.created_at)
                        );

                        console.log('Updated messages:', newMessages);
                        return newMessages;
                    });
                }
                break;
            }


            case 'message_edited':
                if (data.message.chat_id === selectedChat) {
                    setMessages(prev => prev.map(msg =>
                        msg.id === data.message.id ? data.message : msg
                    ));
                }
                break;

            case 'message_deleted':
                if (data.chat_id === selectedChat) {
                    setMessages(prev => prev.filter(msg => msg.id !== data.message_id));
                }
                break;

            case 'typing':
                console.log('Typing event received:', data);

                if (data.chat_id === selectedChat && data.user_id !== myId) {
                    if (data.is_typing) {
                        const userName = await fetchUserName(data.user_id);

                        setTypingUsers(prev => ({
                            ...prev,
                            [data.user_id]: {
                                userName,
                                timestamp: Date.now()
                            }
                        }));

                        if (typingTimeoutRef.current[data.user_id]) {
                            clearTimeout(typingTimeoutRef.current[data.user_id]);
                        }

                        typingTimeoutRef.current[data.user_id] = setTimeout(() => {
                            setTypingUsers(prev => {
                                const updated = { ...prev };
                                delete updated[data.user_id];
                                return updated;
                            });
                        }, 3000);
                    } else {
                        setTypingUsers(prev => {
                            const updated = { ...prev };
                            delete updated[data.user_id];
                            return updated;
                        });
                    }
                }
                break;


            case 'message_read':
                if (data.chat_id === selectedChat) {
                    console.log('Message read in current chat:', data);
                }
                break;

            case 'chat_updated':
                console.log('Chat updated:', data);
                break;

            default:
                console.log('Unknown message type:', data);
        }
    };

    const sendWebSocketAction = (action, payload = {}) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const message = {
                action,
                ...payload
            };
            ws.current.send(JSON.stringify(message));
            console.log('WebSocket action sent:', message);
            return true;
        } else {
            console.error('WebSocket is not connected');
            return false;
        }
    };

    const joinChat = (chatId) => {
        return sendWebSocketAction('join_chat', { chat_id: chatId });
    };

    const sendMessage = () => {
        if (!messageText.trim() || !selectedChat) {
            console.error('No message text or chat selected');
            return;
        }

        const success = sendWebSocketAction('send_message', {
            chat_id: selectedChat,
            text: messageText.trim()
        });

        if (success) {
            setMessageText('');
            sendTyping(false);
        }
    };

    const editMessage = (messageId, newText) => {
        return sendWebSocketAction('edit_message', {
            message_id: messageId,
            text: newText
        });
    };

    const deleteMessage = (messageId) => {
        return sendWebSocketAction('delete_message', {
            message_id: messageId
        });
    };

    const ackMessage = (messageId) => {
        return sendWebSocketAction('ack_message', {
            message_id: messageId
        });
    };

    const readMessages = (messageIds) => {
        return sendWebSocketAction('read_message', {
            message_ids: messageIds
        });
    };

    const sendTyping = (isTyping = true) => {
        if (!selectedChat) return false;

        const now = Date.now();

        if (isTyping && now - lastTypingSentRef.current < TYPING_DEBOUNCE) {
            return false;
        }

        lastTypingSentRef.current = now;

        return sendWebSocketAction('typing', {
            chat_id: selectedChat,
            is_typing: isTyping,
        });
    };

    const fetchMessages = async (chatId) => {
        if (!token) return;

        setLoading(true);
        try {
            const response = await fetch(`https://garantbe.ru/chats/${chatId}/messages/`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch messages');
            }

            const data = await response.json();
            console.log('Messages data:', data);

            const sortedMessages = (data.results || data || []).sort((a, b) =>
                new Date(a.created_at) - new Date(b.created_at)
            );

            setMessages(sortedMessages);
            console.log(chatId);
            setSelectedChat(chatId);

            const chatData = chats.find(chat => chat.id === chatId);
            setSelectedChatData(chatData);

            setTypingUsers({});

            joinChat(chatId);

        } catch (err) {
            console.error('Ошибка загрузки сообщений:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleChatSelect = (chatId) => {
        fetchMessages(chatId);
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

        if (value.trim().length > 0) {
            sendTyping(true);
        } else {
            sendTyping(false);
        }

        // Автоматически отправляем "перестал печатать" через 1 секунду после остановки
        if (typingTimeoutRef.current['stopTyping']) {
            clearTimeout(typingTimeoutRef.current['stopTyping']);
        }

        typingTimeoutRef.current['stopTyping'] = setTimeout(() => {
            sendTyping(false);
        }, 1000);
    };

    const getChatHeaderInfo = (chatData) => {
        if (!chatData) return { name: '', address: '' };

        const participant = chatData.participants.find(p =>
            p.property_info && p.interlocutor && p.interlocutor.name !== 'system'
        );

        if (participant) {
            return {
                name: participant.interlocutor.name || '',
                address: participant.property_info.address || ''
            };
        }

        return {
            name: chatData.interlocutor?.name || '',
            address: chatData.participants.find(p => p.property_info)?.property_info?.address || ''
        };
    };

    // Получаем текст для индикатора набора
    const getTypingText = () => {
        const typingUsersList = Object.values(typingUsers);
        if (typingUsersList.length === 0) return null;

        const userNamesList = typingUsersList.map(({ userName }) => userName);

        if (userNamesList.length === 1) {
            return `${userNamesList[0]} печатает...`;
        } else if (userNamesList.length === 2) {
            return `${userNamesList[0]} и ${userNamesList[1]} печатают...`;
        } else {
            return `${userNamesList.slice(0, -1).join(', ')} и ${userNamesList[userNamesList.length - 1]} печатают...`;
        }
    };

    const formatTime = (dateString) => {
        if (!dateString) return '--:--';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '--:--';

            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch (error) {
            console.error('Ошибка форматирования времени:', error);
            return '--:--';
        }
    };

    const chatHeaderInfo = getChatHeaderInfo(selectedChatData);
    const typingText = getTypingText();

    return (
        <div className="chats">
            <div className="chats__container">
                <div className="chats__logo">
                    <img className={'chats__logo-image'} src="/public/mini-logo.svg" alt=""/>
                    <p className={'chats__logo-name'}>Техническая поддержка</p>
                </div>
                <div className="chats__search">
                    <div className="chats__search-box">
                        <img src="/public/search.svg" alt=""/>
                        <input type="text" placeholder={'Поиск'}/>
                    </div>
                </div>
                <div className="chats__list">
                    {chats && chats.length > 0 ? (
                        chats.map(chat => (
                            <ChatElement
                                key={chat.id}
                                chat={chat}
                                isSelected={selectedChat === chat.id}
                                onSelect={() => handleChatSelect(chat.id)}
                            />
                        ))
                    ) : (
                        <div className="no-chats">Чатов нет</div>
                    )}
                </div>
                <div className={`websocket-status ${isConnected ? 'connected' : 'disconnected'}`}>
                    Status: {isConnected ? 'Connected' : 'Disconnected'}
                </div>
            </div>
            <div className="chats__window">
                {loading ? (
                    <div className="loading">Загрузка сообщений...</div>
                ) : selectedChat ? (
                    <>
                        <div className="chats__window-high">
                            <div className="chats__header">
                                <div className="chats__header-avatar">
                                    {chatHeaderInfo.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="chats__header-name">
                                    <p>{chatHeaderInfo.name}</p>
                                    <p className="chats__header-address">{chatHeaderInfo.address}</p>
                                </div>
                                <button className={'chats__header-info'}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none">
                                        <path d="M10.9989 0C17.0747 0 22 4.92531 22 11.0011C22 17.0758 17.0747 22 10.9989 22C4.92311 22 1.84221e-07 17.0758 1.84221e-07 11.0011C-0.00109971 4.92531 4.92311 0 10.9989 0ZM10.9989 1.64983C9.76241 1.63642 8.53555 1.86838 7.3893 2.33229C6.24306 2.79619 5.2002 3.48282 4.3211 4.35245C3.44199 5.22207 2.74408 6.25742 2.26778 7.39856C1.79147 8.53971 1.54622 9.76399 1.54622 11.0006C1.54622 12.2371 1.79147 13.4614 2.26778 14.6025C2.74408 15.7437 3.44199 16.779 4.3211 17.6487C5.2002 18.5183 6.24306 19.2049 7.3893 19.6688C8.53555 20.1327 9.76241 20.3647 10.9989 20.3513C13.4613 20.3246 15.8138 19.3276 17.5456 17.5769C19.2774 15.8262 20.2488 13.4631 20.2488 11.0006C20.2488 8.53801 19.2774 6.17486 17.5456 4.42416C15.8138 2.67346 13.4613 1.67654 10.9989 1.64983ZM10.9945 9.34906C11.194 9.34881 11.3869 9.42088 11.5374 9.55193C11.6878 9.68297 11.7857 9.86412 11.8128 10.0618L11.8205 10.174L11.8249 16.2256C11.8271 16.4361 11.7486 16.6394 11.6057 16.794C11.4628 16.9485 11.2662 17.0426 11.0562 17.057C10.8462 17.0713 10.6387 17.0048 10.4761 16.8711C10.3135 16.7374 10.2082 16.5466 10.1817 16.3378L10.1751 16.2267L10.1707 10.1751C10.1707 9.9563 10.2576 9.74648 10.4123 9.59178C10.567 9.43708 10.7768 9.35016 10.9956 9.35016M11.0011 5.50385C11.1482 5.49919 11.2948 5.52415 11.4321 5.57725C11.5695 5.63034 11.6947 5.71049 11.8004 5.81293C11.9062 5.91537 11.9902 6.03802 12.0477 6.17358C12.1051 6.30915 12.1347 6.45487 12.1347 6.60209C12.1347 6.74931 12.1051 6.89503 12.0477 7.03059C11.9902 7.16616 11.9062 7.2888 11.8004 7.39125C11.6947 7.49369 11.5695 7.57383 11.4321 7.62693C11.2948 7.68003 11.1482 7.70499 11.0011 7.70033C10.7158 7.6913 10.4453 7.57164 10.2467 7.36666C10.0481 7.16169 9.93707 6.88749 9.93707 6.60209C9.93707 6.31669 10.0481 6.04249 10.2467 5.83752C10.4453 5.63254 10.7158 5.51288 11.0011 5.50385Z" fill="#838383"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="chats__messages">
                            {messages && messages.length > 0 ? (
                                <>
                                    {messages.map(message => (
                                        <div
                                            key={message.id}
                                            className={`message ${message.sender === myId  ? 'message--own' : 'message--other'}`}
                                        >
                                            <div className="message__content">
                                                <div className="message__text">{message.text || 'Нет текста'}</div>
                                                <div className="message__time">
                                                    {message.created_at ? formatTime(message.created_at) : 'Нет времени'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {typingText && (
                                        <div className="typing-indicator">
                                            <div className="typing-dots">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                            <div className="typing-text">{typingText}</div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            ) : (
                                <div>Нет сообщений</div>
                            )}
                        </div>
                        <div className="chats__input">
                            <button className="chats__input-attach">
                                <svg width="29" height="29" viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M15.7842 9.26387L7.73795 17.2022C6.25669 18.6636 6.25669 21.033 7.73795 22.4945C9.21922 23.9559 11.6208 23.9559 13.1021 22.4945L24.5009 11.2485C26.7228 9.05634 26.7228 5.50222 24.5009 3.3101C22.279 1.11799 18.6766 1.11799 16.4547 3.3101L5.05588 14.5561C2.09335 17.4789 2.09335 22.2177 5.05588 25.1406C8.01842 28.0634 12.8216 28.0634 15.7842 25.1406L23.8304 17.2022" stroke="#838383" strokeWidth="1.8" strokeLinecap="round"/>
                                </svg>
                            </button>
                            <input
                                className={'chats__input-row'}
                                placeholder={'Сообщение...'}
                                type="text"
                                value={messageText}
                                onChange={handleInputChange}
                                onKeyPress={handleKeyPress}
                            />
                            <button
                                className="chats__input-sent"
                                onClick={sendMessage}
                                disabled={!messageText.trim() || !isConnected}
                            >
                                <svg width="34" height="33" viewBox="0 0 34 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2.36122 32.5694L33.3074 17.0963C33.7988 16.8506 33.7988 16.1494 33.3074 15.9037L2.37912 0.439558C1.31665 -0.0916754 0.142284 0.926847 0.517921 2.05376L4.08559 12.7567C4.41266 13.738 5.27761 14.4415 6.30486 14.562L21.6398 16.3601C21.7979 16.3786 21.7964 16.6085 21.6381 16.6251L6.33873 18.2263C5.29388 18.3357 4.4106 19.0483 4.08279 20.0464L0.498179 30.9608C0.128409 32.0866 1.30129 33.0994 2.36122 32.5694Z" fill="#ECEAE5"/>
                                </svg>
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