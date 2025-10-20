import './Chats.scss';
import ChatElement from "./chatElement.jsx";
import {useEffect, useState, useRef} from "react";
import ClipLoader from "react-spinners/ClipLoader"

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
    const [userNames, setUserNames] = useState([]);
    const selectedChatRef = useRef(null);
    const [typingText, setTypingText] = useState("");
    const [searchText, setSearchText] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [initialComment, setInitialComment] = useState('');
    const [houses, setHouses] = useState([]);
    const [parking, setParking] = useState([]);



    const searchTimeout = useRef(null);

    const [commentText, setCommentText] = useState('');

    const ws = useRef(null);
    const reconnectTimeout = useRef(null);
    const isInitialized = useRef(false);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef({});
    const userNamesRef = useRef([]);
    const fileInputRef = useRef(null);



    const lastTypingSentRef = useRef(0);
    const TYPING_DEBOUNCE = 1500;

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearchText(value);

        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (value.trim().length === 0 || value.trim().length < 3) {
            searchTimeout.current = setTimeout(() => {
                fetchChats();
            }, 300);
            return;
        }


        searchTimeout.current = setTimeout(() => {
            fetchChats(value.trim());
        }, 300);
    };



    const fetchChats = async (query = '') => {
        if (!token) return;
        try {
            const url = query.length >= 3
                ? `https://garantbe.ru/chats/?search=${encodeURIComponent(query)}`
                : `https://garantbe.ru/chats/?limit=20`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch chats');

            const data = await response.json();
            setChats(data.results || []);
            console.log(chats)
        } catch (err) {
            console.error('Ошибка загрузки чатов:', err);
        }
    };

    useEffect(() => {
        if (!token) return;


        fetchChats();

        const intervalId = setInterval(() => {
            fetchChats();
        }, 10000);

        return () => clearInterval(intervalId);
    }, [token]);

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
                setMyId(meData.id);

                if (!response.ok) {
                    throw new Error('Failed to fetch chats');
                }

                const data = await response.json();
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
        selectedChatRef.current = selectedChat;

        const fetchUsers = async () => {
            try {
                const response = await fetch(`https://garantbe.ru/chats/${selectedChat}/participants`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error('Ошибка при получении участников');
                }

                const data = await response.json();

                const interlocutors = data.results.map(item => ({
                    id: item.interlocutor.id,
                    name: item.interlocutor.name,
                }));

                setUserNames(interlocutors);
                userNamesRef.current = interlocutors;


            } catch (error) {
                console.error(error);
            }
        };

        if (selectedChat) {
            fetchUsers();
        }
    }, [selectedChat]);

    useEffect(() => {
        if (isConnected && selectedChat) {
            joinChat(selectedChat);
        }
    }, [isConnected, selectedChat]);

    useEffect(() => {
        setTypingText(getTypingText());
        scrollToBottom()
    }, [typingUsers]);

    useEffect(() => {
        const fetchSupportDetail = async () => {
            if (!selectedChatData || selectedChatData.chat_type !== 'SUPPORT') return;
            if (!selectedChatData.interlocutor?.id) return;

            try {
                const response = await fetch(
                    `https://garantbe.ru/chats/${selectedChatData.id}/participants/${selectedChatData.interlocutor.id}/detail/`,
                    {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                    }
                );

                if (!response.ok) throw new Error('Не удалось получить детали поддержки');

                const data = await response.json();
                console.log('📞 SUPPORT DETAIL:', data);
                setHouses(data.houses || []);
                setParking(data.parking || []);
            } catch (error) {
                console.error('Ошибка при получении деталей SUPPORT чата:', error);
            }
        };

        fetchSupportDetail();
    }, [selectedChatData, token]);


    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ });
    };

    const initializeWebSocket = () => {
        if (!token) {
            console.error('Token not found for WebSocket');
            return;
        }

        try {
            ws.current = new WebSocket(`wss://garantbe.ru/ws/user_chats/?token=${token}`);

            ws.current.onopen = () => {
                setIsConnected(true);

                if (selectedChat) {
                    joinChat(selectedChat);
                }
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            ws.current.onclose = (event) => {
                setIsConnected(false);

                reconnectTimeout.current = setTimeout(() => {
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

    const handleWebSocketMessage = async (data) => {

        switch (data.type) {
            case 'typing': {
                const chatId = Number(data.chat_id);
                const userId = Number(data.user_id);

                if (chatId === Number(selectedChatRef.current) && userId !== Number(myId)) {
                    const user = Array.isArray(userNamesRef.current)
                        ? userNamesRef.current.find(u => Number(u.id) === userId)
                        : null;

                    const userName = user?.name || `Пользователь ${userId}`;

                    if (data.is_typing) {
                        setTypingUsers(prev => ({
                            ...prev,
                            [userId]: {
                                userId,
                                userName,
                                timestamp: Date.now(),
                            },
                        }));

                        // Таймер для авто-удаления через 10 секунд
                        if (typingTimeoutRef.current[userId]) {
                            clearTimeout(typingTimeoutRef.current[userId]);
                        }
                        typingTimeoutRef.current[userId] = setTimeout(() => {
                            setTypingUsers(prev => {
                                const updated = { ...prev };
                                delete updated[userId];
                                return updated;
                            });
                        }, 10000);
                    } else {
                        setTypingUsers(prev => {
                            const updated = { ...prev };
                            delete updated[userId];
                            return updated;
                        });
                        if (typingTimeoutRef.current[userId]) {
                            clearTimeout(typingTimeoutRef.current[userId]);
                        }
                    }
                }
                break;
            }

            case 'chat_message': {
                if (data.message.chat_id === selectedChatRef.current) {
                    const senderId = Number(data.message.sender_id);

                    setTypingUsers(prev => {
                        const updated = { ...prev };
                        delete updated[senderId];
                        return updated;
                    });

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
                        sender: senderId,
                    };

                    setMessages(prev => {
                        if (prev.some(msg => msg.id === normalized.id)) return prev;
                        return [...prev, normalized].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    });
                }
                break;
            }


            case 'message_read':
                if (data.chat_id === selectedChat) {
                }
                break;

            case 'chat_updated':
                break;

            default:
        }
    };

    const sendWebSocketAction = (action, payload = {}) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const message = {
                action,
                ...payload
            };
            ws.current.send(JSON.stringify(message));
            return true;
        } else {
            console.error('WebSocket is not connected');
            return false;
        }
    };

    const joinChat = (chatId) => {
        return sendWebSocketAction('join_chat', { chat_id: chatId });
    };

    const sendMessage = async () => {
        if (!selectedChat) {
            console.error('Чат не выбран');
            return;
        }

        if (!messageText.trim() && attachedFiles.length === 0) {
            console.error('Нет текста или файлов для отправки');
            return;
        }

        let uploadedFileIds = [];

        if (attachedFiles.length > 0) {
            const formData = new FormData();
            attachedFiles.forEach(file => formData.append('files', file));

            try {
                const response = await fetch('https://garantbe.ru/chats/upload_files/', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error('Ошибка при загрузке файлов');
                }

                const uploadedFiles = await response.json();

                if (Array.isArray(uploadedFiles)) {
                    uploadedFileIds = uploadedFiles.map(file => file.id);
                } else if (uploadedFiles.files && Array.isArray(uploadedFiles.files)) {
                    uploadedFileIds = uploadedFiles.files.map(file => file.id);
                } else if (uploadedFiles.id) {
                    uploadedFileIds = [uploadedFiles.id];
                } else {
                    console.error('Неожиданный формат ответа при загрузке файлов:', uploadedFiles);
                    uploadedFileIds = [];
                }

            } catch (error) {
                console.error('Ошибка при загрузке файлов:', error);
                return;
            }
        }

        const payload = {
            chat_id: selectedChat,
            text: messageText.trim(),
            file_ids: uploadedFileIds,
        };



        const success = sendWebSocketAction('send_message', payload);

        if (success) {
            setMessageText('');
            setAttachedFiles([]);
            sendTyping(false);
        }
    };

    const readMessages = (messageIds) => {
        return sendWebSocketAction('read_message', {
            // message_ids: messageIds,
            chat_id: selectedChat,
        });
    };

    const sendTyping = (isTyping = true) => {
        if (!selectedChat) return;

        const now = Date.now();
        if (isTyping && now - lastTypingSentRef.current < TYPING_DEBOUNCE) {
            return;
        }

        lastTypingSentRef.current = now;
        sendWebSocketAction("typing", {
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

            const sortedMessages = (data.results || data || []).sort((a, b) =>
                new Date(a.created_at) - new Date(b.created_at)
            );

            setMessages(sortedMessages);
            setSelectedChat(chatId);

            const files = await fetch(`https://garantbe.ru/chats/${chatId}/files`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            })

            const files_data = await files.json();

            console.log(files_data.results);

            const unreadMessageIds = sortedMessages
                .filter(msg => msg.is_read === false)
                .map(msg => msg.id);

            if (unreadMessageIds.length > 0) {
                readMessages(unreadMessageIds);
            }


            const chatData = chats.find(chat => chat.id === chatId);
            setSelectedChatData(chatData);

            console.log(selectedChatData);

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

        const trimmed = value.trim();

        if (trimmed.length === 0) {
            if (lastTypingSentRef.current === true) {
                sendTyping(false);
                lastTypingSentRef.current = false;
            }
            return;
        }

        if (trimmed.length > 1 && lastTypingSentRef.current !== true) {
            sendTyping(true);
            lastTypingSentRef.current = true;
        }
    };

    const getChatHeaderInfo = (chatData) => {
        if (!chatData) return { name: '', address: '' };

        console.log(chatData.chat_type);

        const participant = chatData.participants.find(p =>
            p.property_info && p.interlocutor && p.interlocutor.name !== 'system'
        );

        console.log(participant);

        if (chatData.title !== 'Техподдержка'){
            return {
                name: chatData.title,
                address: '',
            }
        }

        if (participant) {
            return {
                name: participant.interlocutor.name || '',
                address: participant.property_info.address || '',
                housing_complex: participant.property_info.housing_complex || '',
                status: participant.property_info.status || '',
                comment: participant.admin_comment || '',
            };
        }



        return {
            name: chatData.interlocutor?.name || '',
            address: chatData.participants.find(p => p.property_info)?.property_info?.address || ''
        };
    };

    const formatAddress = (address, status) => {
        if (!address) return '';

        const match = address.match(/(.*)\s+кв\.(\d+)/i);
        if (match) {
            const street = match[1].trim();
            const apartment = match[2].trim();
            return (
                <>
                    <div className={'modal__adres-info'}>
                        <p>Квартира №{apartment}</p>
                        <span>
                            {status}
                        </span>
                    </div>
                    <p>{street}</p>
                </>
            );
        }

        return <p>{address}</p>;
    };

    const getTypingText = () => {
        const typingUsersList = Object.values(typingUsers)
            .filter(({ userName }) => userName && userName !== 'system');

        if (typingUsersList.length === 0) return null;

        const userNamesList = typingUsersList.map(({ userName }) => userName);

        if (userNamesList.length === 1 ) {
            return `${userNamesList[0]} печатает...`;
        } else if (userNamesList.length === 2) {
            return `${userNamesList[0]} и ${userNamesList[1]} печатают...`;
        } else {
            return `${userNamesList.slice(0, -1).join(", ")} и ${userNamesList[userNamesList.length - 1]} печатают...`;
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

    const handleHeaderInfoClick = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const chatHeaderInfo = getChatHeaderInfo(selectedChatData);

    useEffect(() => {
        if (isModalOpen && chatHeaderInfo.comment !== undefined) {
            setCommentText(chatHeaderInfo.comment);
            setInitialComment(chatHeaderInfo.comment);
        }
    }, [isModalOpen, chatHeaderInfo.comment]);

    const handleCommentChange = (e) => {
        setCommentText(e.target.value);
    };

    const handleSaveComment = async () => {
        if (!selectedChat || userNames.length === 0) return;



        const clientId = selectedChatData.interlocutor.id;

        try {
            const response = await fetch(
                `https://garantbe.ru/chats/${selectedChat}/participants/${clientId}/comment/`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ admin_comment: commentText }),
                }
            );

            if (!response.ok) {
                throw new Error('Не удалось сохранить комментарий');
            }

            setSelectedChatData(prev => ({
                ...prev,
                participants: prev.participants.map(p =>
                    p.interlocutor.id === clientId ? { ...p, admin_comment: commentText } : p
                )
            }));

            setIsModalOpen(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAttachClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setAttachedFiles((prev) => [...prev, ...files]);
    };


    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Б';
        const k = 1024;
        const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };


    return (
        <div className="chats">
            <div className="chats__container">
                <div className="chats__logo">
                    <img className={'chats__logo-image'} src="/mini-logo.svg" alt=""/>
                    <p className={'chats__logo-name'}>Техническая поддержка</p>
                </div>
                <div className="chats__search">
                    <div className="chats__search-box">
                        <img src="/search.svg" alt=""/>
                        <input
                            type="text"
                            placeholder={'Поиск'}
                            value={searchText}
                            onChange={handleSearchChange}
                        />
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
                    <div className="loading">
                        <ClipLoader
                            loading={loading}
                            size={35}
                        />
                    </div>
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
                                <button className={'chats__header-info'} onClick={handleHeaderInfoClick}>
                                    <img src="/info.svg" alt=""/>
                                </button>
                            </div>
                        </div>
                        <div className="chats__messages">
                            {messages && messages.length > 0 ? (
                                <>
                                    {messages.map(message => (
                                        <div
                                            key={message.id}
                                            className={`message ${message.sender === myId ? 'message--own' : 'message--other'}`}
                                        >
                                            <div className="message__content">
                                                {/* Текст сообщения */}


                                                {/* Файлы сообщения */}
                                                {message.files && message.files.length > 0 && (
                                                    <div className="message__files">
                                                        {message.files.map(file => {
                                                            if ( file?.content_type?.startsWith('image/')) {
                                                                return (
                                                                    <img
                                                                        key={file.id}
                                                                        src={file.file_url}
                                                                        alt={file.filename}
                                                                        className="message__image"
                                                                        style={{maxWidth: '560px', maxHeight: '560px'}}
                                                                    />
                                                                );
                                                            } else if (file.content_type === 'application/pdf') {
                                                                return (
                                                                    <div className={'messsage__type-file'}>
                                                                        <a
                                                                            key={file.id}
                                                                            href={file.file_url}
                                                                            download={file.filename}
                                                                            className="message__pdf"
                                                                        >
                                                                            <img src="/file.svg" alt=""/>
                                                                            <div className="file_info">
                                                                                {file.filename}
                                                                                <span>
                                                                                    {formatFileSize(file.file_size)}
                                                                                </span>
                                                                            </div>
                                                                        </a>
                                                                    </div>
                                                                );
                                                            } else {
                                                                return (
                                                                    <div className={'messsage__type-file'}>
                                                                        <a
                                                                            key={file.id}
                                                                            href={file.file_url}
                                                                            download={file.filename}
                                                                            className="message__pdf"
                                                                        >
                                                                            <img src="/file.svg" alt=""/>
                                                                            <div className="file_info">
                                                                                {file.filename}
                                                                                <span>
                                                                                    65 Мб
                                                                                </span>
                                                                            </div>
                                                                        </a>
                                                                    </div>
                                                                );
                                                            }
                                                        })}


                                                    </div>
                                                )}
                                                {message.text && (
                                                    <div className="message__text">{message.text}</div>
                                                )}

                                                <div className="message__time">
                                                    {message.created_at ? formatTime(message.created_at) : 'Нет времени'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {Object.values(typingUsers).filter(u => u.userId !== myId).length > 0 && (
                                        <div className="typing-indicator">
                                            <div className="typing-dots">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                            <div className="typing-text">
                                                {(() => {
                                                    const names = Object.values(typingUsers)
                                                        .filter(u => u.userId !== myId)
                                                        .map(u => u.userName);

                                                    if (names.length === 1) return `${names[0]} печатает...`;
                                                    if (names.length === 2) return `${names[0]} и ${names[1]} печатают...`;
                                                    return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]} печатают...`;
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                    <div ref={messagesEndRef} />
                                </>
                            ) : (
                                <div>Нет сообщений</div>
                            )}
                        </div>

                        {attachedFiles.length > 0 && (
                            <div className="attached-files">
                                {attachedFiles.map((file, index) => (
                                    <div key={index} className="attached-file">
                                        {file.type.startsWith("image/") ? (
                                            <img
                                                src={URL.createObjectURL(file)}
                                                alt={file.name}
                                                className="attached-file__preview"
                                            />
                                        ) : (
                                            <div className="attached-file__icon">
                                                <svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="46" height="46" rx="23" fill="#D2AD84"/>
                                                    <path d="M32.9907 16.412C32.9994 16.3569 32.9994 16.3009 32.9907 16.2458C32.9919 16.2254 32.9919 16.2049 32.9907 16.1845C32.9401 16.1037 32.8738 16.0325 32.7953 15.9746L27.5209 11.1286C27.46 11.0779 27.3909 11.0366 27.3163 11.0061H27.2512C27.1957 10.998 27.1392 10.998 27.0837 11.0061H13.6977C13.524 11.0074 13.3569 11.0687 13.2282 11.1784C13.0995 11.2881 13.0183 11.4385 13 11.601V34.344C13.0024 34.5172 13.0767 34.6828 13.207 34.8053C13.3373 34.9279 13.5134 34.9977 13.6977 35H32.3023C32.4866 34.9977 32.6627 34.9279 32.793 34.8053C32.9233 34.6828 32.9976 34.5172 33 34.344V16.4557C33 16.4557 32.9907 16.4295 32.9907 16.412ZM31.6047 17.1118H27.0372C26.8522 17.1118 26.6747 17.0426 26.5439 16.9196C26.413 16.7966 26.3395 16.6297 26.3395 16.4557V12.257H26.7209L27.707 13.1317L30.5628 15.7559L31.5767 16.6831L31.6047 17.1118Z" fill="white"/>
                                                </svg>
                                                <span className="attached-file__name">{file.name}</span>
                                                <p>{formatFileSize(file.size)}</p>
                                            </div>
                                        )}


                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="chats__input">
                            <button className="chats__input-attach" onClick={handleAttachClick}>
                                <input
                                    type="file"
                                    multiple
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                                <img src="/clip.svg" alt=""/>
                            </button>
                            <textarea
                                className={'chats__input-row'}
                                placeholder={'Сообщение...'}
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
                                    <path d="M2.36122 32.5694L33.3074 17.0963C33.7988 16.8506 33.7988 16.1494 33.3074 15.9037L2.37912 0.439558C1.31665 -0.0916754 0.142284 0.926847 0.517921 2.05376L4.08559 12.7567C4.41266 13.738 5.27761 14.4415 6.30486 14.562L21.6398 16.3601C21.7979 16.3786 21.7964 16.6085 21.6381 16.6251L6.33873 18.2263C5.29388 18.3357 4.4106 19.0483 4.08279 20.0464L0.498179 30.9608C0.128409 32.0866 1.30129 33.0994 2.36122 32.5694Z" fill="#D2AD84"/>
                                </svg>

                            </button>
                        </div>
                    </>
                ) : (
                    <div className="select-chat">
                        <img src="/info.svg" alt=""/>
                        <p>Выберите чат, чтобы начать общение с жильцом</p>
                    </div>
                )}
                {isModalOpen && (
                    <div className="modal-overlay" onClick={handleCloseModal}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <button className="modal-close" onClick={handleCloseModal}>
                                    <img src="/close.svg" alt=""/>
                                </button>
                            </div>
                            <p className={'modal__name'}>{chatHeaderInfo.name}</p>
                            {selectedChatData?.chat_type !== 'SUPPORT' ? (
                                <div className="modal__participants">

                                    <ul>
                                        {userNames.map(user => (
                                            <li key={user.id}>
                                                <div>
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <p>{user.name}</p></li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <>
                                    <p className={'modal__category'}>Объекты</p>
                                    <div className={'modal__objects'}>
                                        <div className="modal__object">
                                            <img src="/house.svg" alt=""/>
                                            <p className={'modal__complex'}>{chatHeaderInfo.housing_complex}</p>
                                        </div>
                                        {houses.length > 0 ? (
                                            houses.map(house => (
                                        <div className={'modal__objects-elements'}>
                                            {formatAddress(house?.full_address , house.status)}
                                        </div>
                                            ))
                                        ) : (
                                            <></>
                                            )}
                                        {parking.length > 0 ? (
                                            parking.map(parkplace => (
                                                <div className={'modal__objects-elements'}>
                                                   <div className="park">
                                                       <div className="modal__adres-info">
                                                       <p>Парковочное место № {parkplace.parking_no}</p>
                                                           <span>
                                                               Владелец
                                                           </span>
                                                       </div>
                                                       <p>
                                                           {parkplace.name} {parkplace.parking_info}
                                                       </p>
                                                   </div>
                                                </div>
                                            )) ):
                                                (
                                            <>
                                            </>
                                                )
                                        }
                                    </div>
                                    <p className={'modal__category'}>Комментарий</p>
                                    <textarea
                                        className={'modal__comment-area'}
                                        value={commentText}
                                        onChange={handleCommentChange}
                                        cols="30"
                                        rows="10"

                                    />
                                    <button className={'modal__save'} onClick={handleSaveComment}
                                            disabled={commentText === initialComment}
                                    >Сохранить</button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Chats;