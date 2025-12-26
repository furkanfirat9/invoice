# Döviz Kuru API Entegrasyonu

## Kaynak
**Coinbase Exchange API** - Ücretsiz, API key gerektirmez.

## Endpoint
```
GET https://api.coinbase.com/v2/exchange-rates?currency=USD
```

## Örnek Kullanım (JavaScript/TypeScript)

```javascript
const response = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
const data = await response.json();

// Kurlar
const usdToTry = parseFloat(data.data.rates.TRY); // USD/TRY
const usdToRub = parseFloat(data.data.rates.RUB); // USD/RUB
const usdToEur = parseFloat(data.data.rates.EUR); // USD/EUR

// Altın (ons -> gram dönüşümü)
const usdPerOunceGold = 1 / parseFloat(data.data.rates.XAU);
const usdPerGramGold = usdPerOunceGold / 31.1035;
const goldPerGramTry = usdPerGramGold * usdToTry;
```

## API Response Örneği
```json
{
  "data": {
    "currency": "USD",
    "rates": {
      "TRY": "35.1234",
      "RUB": "99.5678",
      "EUR": "0.9234",
      "XAU": "0.000385"
    }
  }
}
```

## Notlar
- Rate limit yok (makul kullanımda)
- CORS destekli, frontend'den direkt çağrılabilir
- Gerçek zamanlı güncel kurlar
