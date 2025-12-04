"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Language = "tr" | "ru";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

const translations = {
  tr: {
    // Header
    "selectedLanguage": "Seçili Dil",
    "hi": "Merhaba",

    // Sidebar
    "shipments": "Sevkiyatlar",
    "user": "Kullanıcı",
    "myAddresses": "Adreslerim",
    "courierRequest": "Kargo Talebi",
    "paymentsOfReturn": "İade Ödemeleri",
    "api": "API",
    "setting": "Ayarlar",
    "documents": "Belgeler",
    "logout": "Çıkış Yap",

    // Dashboard
    "shipmentsTitle": "Sevkiyatlar",
    "shipmentsSubtitle": "Sipariş ve sevkiyat yönetimi",
    "filterInputs": "FİLTRE GİRİŞLERİ",
    "cwbCode": "Takip No",
    "referenceCode": "Gönderi No",
    "ozon": "Ozon",
    "allRecords": "Tüm Kayıtlar",
    "recipientName": "Alıcı Adı",
    "dateRange": "Tarih Aralığı",
    "dateFormat": "gg.aa.yyyy",
    "to": "ile",
    "search": "Ara",
    "noShipments": "Henüz sevkiyat bulunmuyor",
    "noShipmentsDesc": "Filtreleri kullanarak arama yapabilirsiniz",
    "excel": "Excel",
    "pdf": "PDF",
    "csv": "CSV",
    "copy": "Kopyala",

    // Table Headers
    "id": "Sıra",
    "cwb": "Takip No",
    "reference": "Gönderi No",
    "tableSenderName": "GÖNDEREN ADI",
    "tableRecipientName": "ALICI ADI",
    "tableDate": "TARİH",
    "check": "KONTROL",
    "etgb": "ETGB",
    "etgbDate": "ETGB TARİHİ",
    "isCancel": "İPTAL DURUMU",
    "notCancel": "İptal Edilmedi",
    "statusCancel": "İptal Edildi",
    "showingEntries": "{from} ile {to} arası, toplam {total} kayıt",
    "previous": "Önceki",
    "next": "Sonraki",
    "loading": "Yükleniyor...",
    "tryAgain": "Tekrar Dene",
    "awaitingDeliver": "Sevkiyat Bekleyen",
    "delivering": "Kargoda",
    "delivered": "Teslim Edildi",
    "cancelled": "İptal Edildi",

    // Modal
    "shipmentDetail": "SEVKİYAT DETAYI",
    "micro": "Micro",
    "courier": "Courier",
    "document": "Döküman",
    "modalChooseFile": "Dosya Seç .....",
    "viewDocument": "Dökümanı Görüntüle",
    "deleteDocument": "Dökümanı Sil",
    "numberDateCurrency": "Numara/Tarih/Para Birimi",
    "invoiceNumber": "Fatura Numarası",
    "modalDate": "Tarih",
    "totalInvoice": "Toplam Fatura",
    "chooseCurrency": "Para Birimi Seç",
    "articleCode": "ÜRÜN KODU",
    "description": "AÇIKLAMA",
    "hscode": "HSCODE",
    "productOriginCountry": "ÜRÜN MENŞE ÜLKESİ",
    "quantity": "MİKTAR",
    "unitPrice": "BİRİM FİYATI",
    "total": "TOPLAM",
    "unitWeight": "BİRİM AĞIRLIĞI",
    "hsCode": "Hs Code",
    "gtip": "Gtip",
    "country": "Ülke",
    "close": "Kapat",
    "saveChanges": "Değişiklikleri Kaydet",
    "noProductsFound": "Ürün bulunamadı",
    "invoiceNumberLabel": "Fatura Numarası",
    "amount": "Tutar",
    "productCategory": "Ürün Kategorisi",
    "selectCategory": "Kategori seçin...",
    "categoryHelper": "Kategori seçildiğinde GTIP kodu otomatik doldurulur",
    "countryOfOrigin": "Menşei Ülkesi",
    "invoiceDate": "Fatura Tarihi",
    "currencyType": "Döviz Cinsi",
    "gtipCode": "GTIP Kodu",
    "invoicePdfFile": "Fatura Linki",
    "etgbPdfFile": "ETGB Linki",
    "chooseFile": "Dosya Seç",
    "noFileChosen": "Dosya seçilmedi",
    "fileHelper": "Sadece PDF dosyası yükleyebilirsiniz (Max: 5MB)",
    "cancel": "İptal",
    "save": "Kaydet",

    // Carrier Panel
    "carrierTitle": "Sevkiyatlar (Carrier)",
    "carrierSubtitle": "Siparişleri filtreleyin ve yönetin",
    "downloadExcel": "Excel İndir",
    "downloadCsv": "CSV İndir",
    "startDate": "Başlangıç Tarihi",
    "endDate": "Bitiş Tarihi",
    "postingNumberPlaceholder": "Gönderi No Ara...",
    "receiverNamePlaceholder": "Alıcı Adı Ara...",
    "trackingNumberPlaceholder": "Takip No Ara...",
    "clearFilters": "Filtreleri Temizle",
    "tableStatus": "Durum",
    "tableInvoice": "Fatura (MIC)",
    "view": "Görüntüle",
    "none": "Yok",
    "upload": "Yükle",
    "page": "Sayfa",
    "city": "Şehir",
    "alertDateLimit": "18.11.2025 tarihinden önceki kayıtlar görüntülenemez.",
    "alertEtgbSuccess": "ETGB belgesi başarıyla yüklendi.",
    "alertError": "Hata: ",
    "alertGenericError": "Bir hata oluştu.",
    "success": "Başarılı",
    "download": "İndir",
    "dropFileHere": "Dosyayı buraya bırakın...",
    "fileSizeError": "Dosya boyutu maksimum 5MB olmalıdır",
    "fileUploadError": "Dosya yüklenirken bir hata oluştu",
    "futureDateError": "Fatura tarihi bugünden ileri bir tarih olamaz.",
    "searchCountry": "Ülke ara...",
    "noCountryFound": "Ülke bulunamadı",
    "selectCountry": "Ülke seçin...",
    "invoiceStatus": "Fatura Durumu",
    "etgbStatus": "ETGB Durumu",
    "carrierPanelTitle": "Carrier Panel",
    "carrierRole": "CARRIER",
    "productInfo": "Ürün Bilgileri",
    "productQuantity": "Ürün Adeti",
    "exists": "Var",
  },
  ru: {
    // Header
    "selectedLanguage": "Язык",
    "hi": "Привет",

    // Sidebar
    "shipments": "Отгрузки",
    "user": "Пользователь",
    "myAddresses": "Мои адреса",
    "courierRequest": "Запрос курьера",
    "paymentsOfReturn": "Платежи возврата",
    "api": "API",
    "setting": "Настройки",
    "documents": "Документы",
    "logout": "Выйти",
    "carrierPanelTitle": "Панель перевозчика",
    "carrierRole": "ПЕРЕВОЗЧИК (служба доставки)",

    // Dashboard
    "shipmentsTitle": "Отгрузки",
    "shipmentsSubtitle": "Управление заказами и отправками",
    "filterInputs": "ВХОДНЫЕ ФИЛЬТРЫ",
    "cwbCode": "Трек-номер",
    "referenceCode": "Номер отправления",
    "ozon": "Ozon",
    "allRecords": "Все записи",
    "recipientName": "Имя получателя",
    "dateRange": "Диапазон дат",
    "dateFormat": "дд.мм.гггг",
    "to": "до",
    "search": "Поиск",
    "noShipments": "Отгрузки не найдены",
    "noShipmentsDesc": "Вы можете выполнить поиск, используя фильтры",
    "excel": "Excel",
    "pdf": "PDF",
    "csv": "CSV",
    "copy": "Копировать",

    // Table Headers
    "id": "№",
    "cwb": "Трек-номер",
    "reference": "Номер отправления",
    "tableSenderName": "ИМЯ ОТПРАВИТЕЛЯ",
    "tableRecipientName": "ИМЯ ПОЛУЧАТЕЛЯ",
    "tableDate": "ДАТА",
    "check": "ПРОВЕРКА",
    "etgb": "ЭТГБ",
    "etgbDate": "ДАТА ЭТГБ",
    "isCancel": "СТАТУС ОТМЕНЫ",
    "notCancel": "Не отменено",
    "statusCancel": "Отменено",
    "showingEntries": "Показано с {from} по {to} из {total} записей",
    "previous": "Назад",
    "next": "Вперёд",
    "loading": "Загрузка...",
    "tryAgain": "Попробовать снова",
    "awaitingDeliver": "Ожидает отправки",
    "delivering": "В доставке",
    "delivered": "Доставлено",
    "cancelled": "Отменено",

    // Modal
    "shipmentDetail": "ДЕТАЛИ ОТПРАВЛЕНИЯ",
    "micro": "Micro",
    "courier": "Courier",
    "document": "Документ",
    "modalChooseFile": "Выбрать файл .....",
    "viewDocument": "Просмотреть документ",
    "deleteDocument": "Удалить документ",
    "numberDateCurrency": "Номер/Дата/Валюта",
    "invoiceNumber": "Номер счета",
    "modalDate": "Дата",
    "totalInvoice": "Общая сумма счета",
    "chooseCurrency": "Выбрать валюту",
    "articleCode": "КОД ТОВАРА",
    "description": "ОПИСАНИЕ",
    "hscode": "HSCODE",
    "productOriginCountry": "СТРАНА ПРОИСХОЖДЕНИЯ",
    "quantity": "КОЛИЧЕСТВО",
    "unitPrice": "ЦЕНА ЗА ЕДИНИЦУ",
    "total": "ИТОГО",
    "unitWeight": "ВЕС ЕДИНИЦЫ",
    "hsCode": "Hs Code",
    "gtip": "Gtip",
    "country": "Страна",
    "close": "Закрыть",
    "saveChanges": "Сохранить изменения",
    "noProductsFound": "Товары не найдены",
    "invoiceNumberLabel": "Номер счета",
    "amount": "Сумма",
    "productCategory": "Категория товара",
    "selectCategory": "Выберите категорию...",
    "categoryHelper": "При выборе категории код GTIP заполняется автоматически",
    "countryOfOrigin": "Страна происхождения",
    "invoiceDate": "Дата счета",
    "currencyType": "Валюта",
    "gtipCode": "Код GTIP",
    "invoicePdfFile": "Ссылка на счет",
    "etgbPdfFile": "Ссылка на ЭТГБ",
    "chooseFile": "Выбрать файл",
    "noFileChosen": "Файл не выбран",
    "fileHelper": "Вы можете загружать только PDF файлы (Макс: 5MB)",
    "cancel": "Отмена",
    "save": "Сохранить",

    // Carrier Panel
    "carrierTitle": "Отгрузки (Перевозчик)",
    "carrierSubtitle": "Фильтрация и управление отправлениями",
    "downloadExcel": "Скачать Excel",
    "downloadCsv": "Скачать CSV",
    "startDate": "Дата начала",
    "endDate": "Дата окончания",
    "postingNumberPlaceholder": "Поиск номера отправления...",
    "receiverNamePlaceholder": "Поиск имени получателя...",
    "trackingNumberPlaceholder": "Поиск трек-номера...",
    "clearFilters": "Очистить фильтры",
    "tableStatus": "Статус",
    "tableInvoice": "Счёт (МИК)",
    "view": "Открыть",
    "none": "Нет",
    "upload": "Загрузить",
    "page": "Страница",
    "city": "Город",
    "alertDateLimit": "Записи до 18.11.2025 не могут быть отображены.",
    "alertEtgbSuccess": "Документ ЭТГБ успешно загружен.",
    "alertError": "Ошибка: ",
    "alertGenericError": "Произошла ошибка.",
    "success": "Успешно",
    "download": "Скачать",
    "dropFileHere": "Перетащите файл сюда...",
    "fileSizeError": "Размер файла должен быть не более 5 МБ",
    "fileUploadError": "Произошла ошибка при загрузке файла",
    "futureDateError": "Дата счета не может быть в будущем.",
    "searchCountry": "Поиск страны...",
    "noCountryFound": "Страна не найдена",
    "selectCountry": "Выберите страну...",
    "invoiceStatus": "Статус счета",
    "etgbStatus": "Статус ЭТГБ",
    "productInfo": "Информация о товаре",
    "productQuantity": "Количество товара",
    "exists": "Есть",
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("tr");

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.tr] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
