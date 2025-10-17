import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.scss';

function App() {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();

        try {
            const response = await fetch('https://garantbe.ru/accounts/auth_by_pass_email/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': 'BGA4ziJP4OtECRpDjWHPgOhs9xovbL7QkIutq0yBVKgFmk8mfXu0CR4dyuicCihn',
                },
                body: JSON.stringify({
                    email: phone,
                    password,
                }),
            });

            if (!response.ok) {
                throw new Error('Authentication failed');
            }

            const data = await response.json();
            localStorage.setItem('token', data.token);
            navigate('/chats');
        } catch (err) {
            setError('Ошибка авторизации. Проверьте данные и попробуйте снова.');
        }
    };

    return (
        <div className="login">
            <img src="/public/logo.svg" alt="Logo" />
            <div className="login__form">
                <p>Авторизация</p>
                {error && <p className="error">{error}</p>}
                <form onSubmit={handleLogin}>
                    <div className="login__form-box">
                        <p>Логин</p>
                        <input
                            type="text"
                            placeholder="mail@mail.com"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                        />
                    </div>
                    <div className="login__form-box">
                        <p>Пароль</p>
                        <input
                            type="password"
                            placeholder="Введите пароль"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="login__form-button">
                        Войти
                    </button>
                </form>
            </div>
        </div>
    );
}

export default App;