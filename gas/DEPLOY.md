# Deploy คู่มือ — DrugInventory GAS API

## สถานะ deploy (อัปเดต 2 ก.ย. 2569)

| รายการ | ค่า |
|--------|-----|
| Script ID | `1oUZ4XX3_WibcXT3MqHWYQdlxxTtvK9zaT9Lvf4Fhob9TuEUxIOJ_pwIN` |
| Script Editor | https://script.google.com/d/1oUZ4XX3_WibcXT3MqHWYQdlxxTtvK9zaT9Lvf4Fhob9TuEUxIOJ_pwIN/edit |
| โค้ด | push แล้ว (`Code.gs` + `appsscript.json`) |

## ขั้นตอนที่ต้องทำในเบราว์เซอร์ (ครั้งเดียว)

เปิด Script Editor แล้วทำตามนี้:

1. กด **Deploy** → **New deployment**
2. ไอคอน ⚙️ → เลือกประเภท **Web app**
3. ตั้งค่า:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. กด **Deploy** → อนุญาตสิทธิ์ (Drive + Sheets) ถ้าถาม
5. **คัดลอก Web app URL** (ลงท้าย `/exec`)

## ใส่ URL ในเว็บคลังยา

1. เปิด https://pongvitsam.github.io/DrugInventorySystem/
2. **ตั้งค่า / นำเข้า** → **ฐานข้อมูล Google**
3. วาง URL → **บันทึก URL** → **ทดสอบการเชื่อมต่อ**
4. เครื่องแรก: **อัปโหลดข้อมูลเครื่องนี้ขึ้น Google**
5. เครื่องอื่น: **ดึงข้อมูลจาก Google**

## อัปเดตโค้ดครั้งถัดไป

```powershell
cd gas
clasp push --force
node deploy-webapp.mjs
```

จากนั้นใน Script Editor: **Deploy → Manage deployments → Edit (✏️) → Version: New version → Deploy**

หรือใช้ URL เดิมจาก deployment ล่าสุดหลัง `node deploy-webapp.mjs` (ถ้า Web app entry ถูกสร้างแล้ว)

## ทดสอบ

```
https://script.google.com/macros/s/DEPLOYMENT_ID/exec?action=ping
```

ควรได้ JSON: `{"ok":true,"service":"DrugInventoryGAS","version":5}`

## รหัสเชื่อมต่อ (SYNC_TOKEN)

กันคนที่รู้ URL Web App อ่านหรือทับชีต:

1. ในเว็บ: **ตั้งค่า / นำเข้า** → สร้างรหัสเชื่อมต่อ แล้วคัดลอก
2. ใน Script Editor: **Project Settings → Script properties → Add**
   - Property: `SYNC_TOKEN`
   - Value: รหัสเดียวกับในเว็บ
3. Deploy เวอร์ชันใหม่ของ Web App หลัง `clasp push`

ถ้ายังไม่ตั้ง `SYNC_TOKEN` ระบบทำงานแบบเดิม (Anyone อ่าน/เขียนได้)
