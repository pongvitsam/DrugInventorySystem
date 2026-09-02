# ฐานข้อมูล Google Apps Script (GAS)

ใช้ Google Spreadsheet เป็นฐานข้อมูลกลาง — ทุกเครื่องที่เปิดเว็บและตั้ง URL เดียวกันจะ sync ข้อมูลร่วมกัน

## ขั้นตอนติดตั้ง (ครั้งเดียว)

### 1. สร้าง Apps Script project

1. เปิด [Google Apps Script](https://script.google.com/)
2. สร้างโปรเจกต์ใหม่
3. คัดลอกเนื้อหาจากไฟล์ `gas/Code.gs` ใน repo นี้ไปวางใน `Code.gs`
4. บันทึก (Ctrl+S)

### 2. สร้าง Spreadsheet

1. ใน Apps Script เลือกฟังก์ชัน `setupSpreadsheet_` แล้วกด **Run**
2. อนุญาตสิทธิ์เมื่อถูกถาม (Google Drive + Sheets)
3. เปิด **View → Logs** จะเห็น Spreadsheet ID และ URL
4. Script จะบันทึก `SPREADSHEET_ID` ใน Script Properties อัตโนมัติ

### 3. Deploy Web App

1. **Deploy → New deployment**
2. ประเภท: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone** (สำคัญ — ให้เว็บ GitHub Pages เรียกได้)
5. Deploy แล้วคัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

### 4. ตั้งค่าในเว็บคลังยา

1. เปิด https://pongvitsam.github.io/DrugInventorySystem/
2. ไป **ตั้งค่า / นำเข้า → ฐานข้อมูล Google**
3. วาง URL Web App → **บันทึก URL** → **ทดสอบการเชื่อมต่อ**
4. ถ้ามีข้อมูลอยู่ในเครื่องเดิม: กด **อัปโหลดข้อมูลเครื่องนี้ขึ้น Google** (ครั้งแรก)
5. เครื่องอื่น: ใส่ URL เดียวกัน → **ดึงข้อมูลจาก Google**

## API ที่ GAS ให้บริการ

| คำขอ | คำอธิบาย |
|------|----------|
| `GET ?action=ping` | ทดสอบการเชื่อมต่อ |
| `GET ?action=export` | ดึงข้อมูลทั้งหมด (JSON) |
| `POST { action: 'import', data: {...} }` | บันทึกข้อมูลทั้งหมด |

## ชีตใน Spreadsheet

- `Settings`, `Seq`, `Items`, `Stock`, `Receipts`, `ReceiptLines`
- `Transfers`, `TransferLines`, `Adjustments`, `AdjustmentLines`
- `Movements`, `MonthlyRequests`

## หมายเหตุ

- หลังบันทึกรับเข้า/เบิก/แก้รายการ ระบบจะ sync ขึ้น Google อัตโนมัติ (เมื่อตั้ง URL แล้ว)
- URL Web App เก็บในเบราว์เซอร์แต่ละเครื่อง — ต้องใส่ URL เดียวกันทุกเครื่อง
- อย่าแชร์ Spreadsheet ให้คนทั่วไปแก้ไขโดยตรง ควรใช้ผ่านเว็บเท่านั้น
- ถ้า deploy ใหม่ URL อาจเปลี่ยน — อัปเดตในเว็บทุกเครื่อง
