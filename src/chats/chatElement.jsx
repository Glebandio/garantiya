function ChatElement({ chat, isSelected, onSelect }) {

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

    const interlocutorName = chat.title !== "Техподдержка" ? chat.title : chat?.interlocutor?.name || 'Неизвестный';
    const lastMessage = chat?.last_message?.text !=null ? chat?.last_message?.text : 'Нет сообщений';
    const createdAt = chat?.created_at;


    return (
        <div
            className={`chats__element ${isSelected ? 'chats__element--selected' : ''}`}
            onClick={onSelect}
            style={{ cursor: 'pointer' }}
        >
            <div className="chats__element-avatar">
                {interlocutorName.charAt(0).toUpperCase()}
            </div>
            <div className="chats__element-box">
                <div className="chats__element-upper">
                    <div className="chats__element-name">
                        {interlocutorName}
                    </div>
                    <div className="chats__element-time">
                        {formatTime(createdAt)}
                    </div>
                </div>
                <div className="chats__element-lower">
                    <p style={{width:'100%'}}>
                    {lastMessage.slice(0, 20)}
                    </p>
                    {
                        chat.unread_count > 0 ? (
                            <div className={'chats__element-count'}>
                                {chat.unread_count}
                            </div>
                        ) : (
                            <>
                            </>
                        )
                    }

                </div>
            </div>
        </div>
    )
}

export default ChatElement;