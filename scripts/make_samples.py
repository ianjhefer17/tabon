"""Generate FICTIONAL Philippine sample documents for Tabon demos.

All names, numbers, addresses and companies below are invented.
Every image is watermarked 'SAMPLE — FICTIONAL DATA'.

Usage:
    python3 -m venv .venv && .venv/bin/pip install pillow
    .venv/bin/python scripts/make_samples.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "samples"
THUMBS = OUT / "thumbs"
W = 1600
THUMB_W = 320

INK = (20, 24, 31)
MUTED = (95, 102, 115)
LINE = (200, 205, 212)
WHITE = (255, 255, 255)

REGULAR_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
]
BOLD_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def font(size, bold=False):
    for path in BOLD_FONTS if bold else REGULAR_FONTS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def new_doc(height, bg=WHITE):
    img = Image.new("RGB", (W, height), bg)
    return img, ImageDraw.Draw(img)


def text(d, xy, s, size=30, bold=False, fill=INK, anchor="la"):
    d.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor)


def label_value(d, x, y, label, value, value_size=34):
    text(d, (x, y), label.upper(), size=22, bold=True, fill=MUTED)
    text(d, (x, y + 30), value, size=value_size, bold=True)


def hline(d, y, x0=80, x1=W - 80, fill=LINE, width=2):
    d.line([(x0, y), (x1, y)], fill=fill, width=width)


def table(d, y, columns, rows, row_h=56, header_fill=(236, 239, 243)):
    """columns: list of (title, x, align) where align is 'l' or 'r'."""
    d.rectangle([80, y, W - 80, y + row_h], fill=header_fill)
    for title, x, align in columns:
        text(d, (x, y + row_h // 2), title, size=24, bold=True, fill=MUTED, anchor=align + "m")
    y += row_h
    for row in rows:
        for (_, x, align), cell in zip(columns, row):
            text(d, (x, y + row_h // 2), cell, size=27, anchor=align + "m")
        y += row_h
        hline(d, y, width=1)
    return y


def peso(n):
    return f"PHP {n:,.2f}"


def watermark(img):
    """Light diagonal watermark tiled across the page."""
    base = img.convert("RGBA")
    layer = Image.new("RGBA", (base.width * 2, base.height * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(72, bold=True)
    label = "SAMPLE — FICTIONAL DATA"
    step_x = int(d.textlength(label, font=f)) + 160
    for row, y in enumerate(range(0, layer.height, 360)):
        offset = (row % 2) * step_x // 2
        for x in range(-step_x, layer.width, step_x):
            d.text((x + offset, y), label, font=f, fill=(220, 38, 38, 46))
    layer = layer.rotate(30, resample=Image.BICUBIC)
    left = (layer.width - base.width) // 2
    top = (layer.height - base.height) // 2
    layer = layer.crop((left, top, left + base.width, top + base.height))
    return Image.alpha_composite(base, layer).convert("RGB")


def save(img, name):
    img = watermark(img)
    img.save(OUT / name, optimize=True)
    thumb = img.resize((THUMB_W, round(img.height * THUMB_W / img.width)), Image.LANCZOS)
    thumb.save(THUMBS / name, optimize=True)
    print(f"wrote {OUT / name} ({img.width}x{img.height})")


def id_card():
    img, d = new_doc(1010, bg=(244, 247, 250))
    d.rounded_rectangle([20, 20, W - 20, 990], radius=40, outline=(30, 64, 120), width=6)
    d.rounded_rectangle([20, 20, W - 20, 190], radius=40, fill=(30, 64, 120))
    d.rectangle([20, 150, W - 20, 190], fill=(30, 64, 120))
    text(d, (W // 2, 75), "REPUBLIC OF THE PHILIPPINES", size=40, bold=True, fill=WHITE, anchor="mm")
    text(d, (W // 2, 135), "Unified Identification Card", size=32, fill=(210, 222, 240), anchor="mm")

    # Photo placeholder
    d.rectangle([80, 250, 480, 750], fill=(190, 194, 200), outline=(140, 145, 152), width=3)
    text(d, (280, 500), "PHOTO", size=40, bold=True, fill=(120, 125, 132), anchor="mm")

    x = 560
    label_value(d, x, 250, "CRN", "0028-1234567-8", value_size=44)
    label_value(d, x, 360, "Name", "JUAN MIGUEL DELA CRUZ SANTOS", value_size=42)
    label_value(d, x, 470, "Date of Birth", "1992-03-14")
    label_value(d, x + 420, 470, "Sex", "M")
    text(d, (x, 580), "ADDRESS", size=22, bold=True, fill=MUTED)
    text(d, (x, 610), "Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro,", size=32, bold=True)
    text(d, (x, 655), "Angono, Rizal 1930", size=32, bold=True)

    hline(d, 800, x0=80, x1=W - 80, fill=(30, 64, 120), width=3)
    text(d, (80, 840), "Signature", size=22, bold=True, fill=MUTED)
    d.line([(80, 930), (700, 930)], fill=INK, width=2)
    text(d, (W - 80, 930), "Date Issued: 2023-07-01", size=26, fill=MUTED, anchor="rs")
    save(img, "id_card.png")


def bank_statement():
    img, d = new_doc(2000)
    d.rectangle([0, 0, W, 170], fill=(13, 110, 80))
    text(d, (80, 60), "Bayan Savings Bank", size=56, bold=True, fill=WHITE)
    text(d, (80, 125), "Statement of Account · Savings", size=28, fill=(200, 235, 220))
    text(d, (W - 80, 100), "Period: 01 Sep 2026 – 30 Sep 2026", size=28, fill=WHITE, anchor="rm")

    label_value(d, 80, 220, "Account Holder", "JUAN MIGUEL DELA CRUZ SANTOS")
    label_value(d, 900, 220, "Account Number", "0123-4567-8901")
    label_value(d, 80, 330, "Mailing Address", "Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro, Angono, Rizal 1930", value_size=30)
    label_value(d, 80, 440, "Mobile", "0917 123 4567")
    label_value(d, 900, 440, "Email", "juan.santos@example.com")
    hline(d, 540)

    opening = 48250.75
    txns = [
        ("02 Sep", "Payroll Credit - Halimbawa Tech", 0, 32450.00),
        ("03 Sep", "ATM Withdrawal - Angono Branch", 5000.00, 0),
        ("05 Sep", "Bills Payment - Maliwanag Power", 3184.60, 0),
        ("09 Sep", "Online Transfer to M. Reyes", 2500.00, 0),
        ("12 Sep", "POS Purchase - Grocery", 4127.35, 0),
        ("17 Sep", "Payroll Credit - Halimbawa Tech", 0, 32450.00),
        ("22 Sep", "Bills Payment - Mobile Postpaid", 1299.00, 0),
        ("28 Sep", "Interest Earned", 0, 18.42),
    ]
    rows, bal = [], opening
    for date, desc, debit, credit in txns:
        bal += credit - debit
        rows.append((date, desc, f"{debit:,.2f}" if debit else "", f"{credit:,.2f}" if credit else "", f"{bal:,.2f}"))

    text(d, (80, 580), "Transaction History", size=34, bold=True)
    cols = [("DATE", 100, "l"), ("DESCRIPTION", 260, "l"), ("DEBIT", 1080, "r"), ("CREDIT", 1300, "r"), ("BALANCE", 1500, "r")]
    y = table(d, 640, cols, [("", "Opening Balance", "", "", f"{opening:,.2f}")] + rows)

    y += 60
    d.rectangle([900, y, W - 80, y + 200], fill=(236, 245, 240))
    text(d, (930, y + 50), "Opening Balance", size=28, fill=MUTED, anchor="lm")
    text(d, (W - 110, y + 50), peso(opening), size=28, anchor="rm")
    text(d, (930, y + 140), "Closing Balance", size=32, bold=True, anchor="lm")
    text(d, (W - 110, y + 140), peso(bal), size=32, bold=True, anchor="rm")

    text(d, (80, 1930), "Bayan Savings Bank is a fictional institution created for demonstration purposes.", size=22, fill=MUTED)
    save(img, "bank_statement.png")


def payslip():
    img, d = new_doc(1800)
    text(d, (80, 90), "Halimbawa Tech Inc.", size=54, bold=True, fill=(88, 28, 135))
    text(d, (80, 145), "8F Mabini Tower, 456 Kalayaan Ave., Makati City", size=26, fill=MUTED)
    text(d, (W - 80, 90), "PAYSLIP", size=54, bold=True, anchor="rs")
    text(d, (W - 80, 145), "Pay Period: 01–15 Sep 2026", size=26, fill=MUTED, anchor="rs")
    hline(d, 190, fill=(88, 28, 135), width=4)

    label_value(d, 80, 230, "Employee Name", "JUAN MIGUEL DELA CRUZ SANTOS")
    label_value(d, 900, 230, "Employee No.", "HT-2019-0457")
    label_value(d, 80, 340, "Position", "Senior Software Engineer")
    label_value(d, 900, 340, "TIN", "123-456-789-000")
    label_value(d, 80, 450, "SSS No.", "34-1234567-8")
    label_value(d, 900, 450, "PhilHealth No.", "12-345678901-2")
    label_value(d, 80, 560, "Pag-IBIG MID No.", "1234-5678-9012")
    label_value(d, 900, 560, "Payroll Account", "0123-4567-8901")
    hline(d, 670)

    earnings = [("Basic Pay", 35000.00), ("Rice Allowance", 1000.00), ("Overtime (6 hrs)", 1520.45)]
    deductions = [("Withholding Tax", 2645.20), ("SSS Contribution", 900.00), ("PhilHealth Contribution", 875.00),
                  ("Pag-IBIG Contribution", 100.00), ("Salary Loan", 549.25)]
    gross = sum(a for _, a in earnings)
    total_ded = sum(a for _, a in deductions)

    text(d, (80, 710), "Earnings", size=34, bold=True)
    cols = [("DESCRIPTION", 100, "l"), ("AMOUNT", 1500, "r")]
    y = table(d, 770, cols, [(n, f"{a:,.2f}") for n, a in earnings] + [("Gross Pay", f"{gross:,.2f}")])

    text(d, (80, y + 50), "Deductions", size=34, bold=True)
    y = table(d, y + 110, cols, [(n, f"{a:,.2f}") for n, a in deductions] + [("Total Deductions", f"{total_ded:,.2f}")])

    y += 60
    d.rectangle([80, y, W - 80, y + 110], fill=(243, 232, 255))
    text(d, (120, y + 55), "NET PAY", size=40, bold=True, anchor="lm")
    text(d, (W - 120, y + 55), peso(gross - total_ded), size=40, bold=True, anchor="rm")

    text(d, (80, 1730), "Halimbawa Tech Inc. is a fictional company created for demonstration purposes.", size=22, fill=MUTED)
    save(img, "payslip.png")


def utility_bill():
    img, d = new_doc(1600)
    d.rectangle([0, 0, W, 170], fill=(234, 179, 8))
    text(d, (80, 60), "Maliwanag Power Co.", size=56, bold=True)
    text(d, (80, 125), "Statement of Account · Electricity", size=28, fill=(66, 52, 6))

    label_value(d, 80, 220, "Customer Name", "JUAN MIGUEL DELA CRUZ SANTOS")
    label_value(d, 1000, 220, "Account No.", "3012-4455-67")
    label_value(d, 80, 330, "Service Address", "Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro, Angono, Rizal 1930", value_size=30)
    label_value(d, 80, 440, "Billing Period", "Aug 28, 2026 – Sep 27, 2026")
    label_value(d, 1000, 440, "Meter No.", "MPC-88214093")
    hline(d, 540)

    text(d, (80, 580), "Billing Details", size=34, bold=True)
    charges = [
        ("Previous Reading", "14,208 kWh"),
        ("Present Reading", "14,476 kWh"),
        ("Total Consumption", "268 kWh"),
        ("Generation Charge", "1,687.06"),
        ("Transmission & Distribution", "856.93"),
        ("Taxes & Other Charges", "640.61"),
    ]
    y = table(d, 640, [("ITEM", 100, "l"), ("VALUE", 1500, "r")], charges)

    y += 60
    d.rectangle([80, y, W - 80, y + 200], fill=(254, 249, 195), outline=(202, 138, 4), width=3)
    text(d, (120, y + 60), "TOTAL AMOUNT DUE", size=34, bold=True, anchor="lm")
    text(d, (W - 120, y + 60), peso(3184.60), size=48, bold=True, anchor="rm")
    text(d, (120, y + 145), "Due Date: Oct 12, 2026", size=30, fill=MUTED, anchor="lm")

    text(d, (80, 1530), "Maliwanag Power Co. is a fictional utility created for demonstration purposes.", size=22, fill=MUTED)
    save(img, "utility_bill.png")


if __name__ == "__main__":
    THUMBS.mkdir(parents=True, exist_ok=True)
    id_card()
    bank_statement()
    payslip()
    utility_bill()
