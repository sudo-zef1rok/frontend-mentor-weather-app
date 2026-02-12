import "./globals.css";

export const metadata = {
  title: "Погода сейчас",
  description: "Приложение погоды с почасовым и ежедневным прогнозом.",
  icons: {
    icon: "/favicon-32x32.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
