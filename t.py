import requests
import xml.etree.ElementTree as ET
from datetime import datetime

def tcmb_usd_try(date_str: str | None = None) -> float:
    """
    date_str: 'DD.MM.YYYY' (örn '16.12.2025') veya None (today.xml)
    dönüş: USD/TRY Döviz Satış (ForexSelling)
    """
    if date_str:
        dt = datetime.strptime(date_str, "%d.%m.%Y")
        url = f"https://www.tcmb.gov.tr/kurlar/{dt:%Y%m}/{dt:%d%m%Y}.xml"
    else:
        url = "https://www.tcmb.gov.tr/kurlar/today.xml"

    r = requests.get(url, timeout=20)
    r.raise_for_status()

    root = ET.fromstring(r.content)
    cur = root.find(".//Currency[@CurrencyCode='USD']")
    if cur is None:
        raise RuntimeError("USD bulunamadı (tatil/hafta sonu olabilir).")

    selling = cur.findtext("ForexSelling")
    if not selling:
        raise RuntimeError("ForexSelling boş döndü.")

    return float(selling)

print(tcmb_usd_try("25.12.2025"))
