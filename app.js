const GOOGLE_API_KEY = "AIzaSyDK6yM28KqdSZUAvonDD7tq-hrILHvlfkA";

//------------------------------------------------------
// 1. פונקציה שמוסיפה יכולת Autocomplete לכל שדה כתובת
//------------------------------------------------------
function attachAutocomplete(input) {
    const autocomplete = new google.maps.places.Autocomplete(input, {
        // ללא types => מחזיר כתובות, עסקים, תחנות ונקודות עניין (POI)
        componentRestrictions: { country: "il" } // ישראל בלבד
    });
    autocomplete.setFields(["name", "formatted_address", "geometry"]);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;
        input.dataset.lat = place.geometry.location.lat();
        input.dataset.lng = place.geometry.location.lng();

        // אם למקום יש שם (תחנה/עסק/POI) שאינו זהה לכתובת, נציג "שם, כתובת"
        const name = place.name || "";
        const address = place.formatted_address || "";
        if (name && address && !address.startsWith(name)) {
            input.value = `${name}, ${address}`;
        } else {
            input.value = address || name;
        }
    });
}

async function geocode(inputElement) {
    const address = inputElement.value;
    if (inputElement.dataset.lat && inputElement.dataset.lng) {
        return {
            lat: parseFloat(inputElement.dataset.lat),
            lon: parseFloat(inputElement.dataset.lng),
            address: address
        };
    }

    // קריאה ל-Google Geocoding API
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}&language=he`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) return null;

    const loc = data.results[0].geometry.location;

    return {
        lat: loc.lat,
        lon: loc.lng,
        address: data.results[0].formatted_address
    };
}


//------------------------------------------------------
// 3. חישוב מרחק בין שתי נקודות
//------------------------------------------------------
function distance(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;

    const x = Math.sin(dLat/2)**2 +
              Math.sin(dLon/2)**2 * Math.cos(lat1)*Math.cos(lat2);

    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

//------------------------------------------------------
// 4. יצירת כל הפרמוטציות (לפתרון TSP קטן)
//------------------------------------------------------
function permute(arr) {
    if (arr.length <= 1) return [arr];

    const res = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];

        for (const p of permute(rest)) {
            res.push([arr[i], ...p]);
        }
    }
    return res;
}

function formatAddress(item) {
    const addr = item.address;
    const parts = [];

    // חיפוש מספר בית בתוך display_name אם לא קיים ב-house_number
    let houseNumber = addr.house_number || "";
    let road = addr.road || "";

    if (!houseNumber && road && item.display_name) {
        // חיפוש מספר מיד אחרי שם הרחוב
        const regex = new RegExp(road + "\\s+(\\d+)", "i");
        const match = item.display_name.match(regex);
        if (match) houseNumber = match[1];
    }

    // בונים את החלק של רחוב + מספר בית
    if (road) {
        if (houseNumber) parts.push(`${road} ${houseNumber}`);
        else parts.push(road);
    } else if (houseNumber) {
        parts.push(houseNumber);
    }

    // מוסיפים יישוב: village → town → city
    if (addr.village) parts.push(addr.village);
    else if (addr.town) parts.push(addr.town);
    else if (addr.city) parts.push(addr.city);

    return parts.join(", ");
}



//------------------------------------------------------
// 5. למצוא את הסדר הכי קצר בין נקודת התחלה ונקודת סוף קבועות
//------------------------------------------------------
function findBestOrder(start, end, points) {
    const perms = permute(points);
    let best = null;
    let bestDist = Infinity;

    for (const p of perms) {
        let total = 0;
        let prev = start;

        for (const stop of p) {
            total += distance(prev, stop);
            prev = stop;
        }

        total += distance(prev, end);

        if (total < bestDist) {
            bestDist = total;
            best = p;
        }
    }

    return best;
}

//------------------------------------------------------
// 6. הפעלת Autocomplete על שדות קיימים
//------------------------------------------------------
attachAutocomplete(document.getElementById("startAddress"));
attachAutocomplete(document.getElementById("endAddress"));

//------------------------------------------------------
// 7. הוספת כתובת עצירה חדשה + autocomplete
//------------------------------------------------------
document.getElementById("addAddressBtn").addEventListener("click", () => {
    const container = document.getElementById("addresses-container");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "address";
    input.placeholder = "כתובת עצירה";
    container.appendChild(input);

    attachAutocomplete(input);
    input.focus();
});
// מפה ראשונית כבר מהטעינה
window.map = L.map("map").setView([31.5, 34.8], 8); // מרכז על ישראל
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(window.map);

//------------------------------------------------------
// 8. State של המסלול הנוכחי (כדי לאפשר עריכה/מחיקה וחישוב מחדש)
//------------------------------------------------------
// כל נקודה: { lat, lon, address, role: "start" | "stop" | "end" }
let routePoints = [];

//------------------------------------------------------
// חישוב מחדש: לוקח start+end ומחשב מחדש את הסדר האופטימלי של העצירות,
// ואז מרנדר את הרשימה והמפה. משמש גם בלחיצה הראשונה וגם אחרי עריכה/מחיקה.
//------------------------------------------------------
function recomputeAndRender() {
    const start = routePoints.find(p => p.role === "start");
    const end   = routePoints.find(p => p.role === "end");
    const stops = routePoints.filter(p => p.role === "stop");

    if (!start || !end) return;

    const bestStops = findBestOrder(start, end, stops) || [];

    // שומרים את הסדר האופטימלי החדש של העצירות ב-state
    routePoints = [start, ...bestStops, end];

    renderRouteList(routePoints);
    drawRouteOnMap(routePoints);
}

//------------------------------------------------------
// ציור המסלול על המפה
//------------------------------------------------------
function drawRouteOnMap(routeArr) {
    if (window.routeLayer) window.routeLayer.remove();
    if (window.markers) window.markers.forEach(m => m.remove());

    const latlngs = routeArr.map(p => [p.lat, p.lon]);

    window.routeLayer = L.polyline(latlngs, { color: "blue" }).addTo(window.map);
    window.markers = routeArr.map(p =>
        L.marker([p.lat, p.lon]).addTo(window.map).bindPopup(p.address)
    );

    if (latlngs.length > 0) {
        const bounds = L.latLngBounds(latlngs);
        window.map.fitBounds(bounds, { padding: [50, 50] });
    }
}

//------------------------------------------------------
// פתיחת ניווט בוויז - במובייל פותח ישירות את האפליקציה (deep link),
// עם נפילה לקישור הרגיל אם האפליקציה לא מותקנת (למשל בדסקטופ)
//------------------------------------------------------
function openWaze(lat, lon) {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const appUrl = `waze://?ll=${lat},${lon}&navigate=yes`;
    const webUrl = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;

    if (isMobile) {
        // ננסה לפתוח את האפליקציה; אם היא לא נפתחה תוך זמן קצר, ניפול לאתר
        const fallback = setTimeout(() => {
            window.location.href = webUrl;
        }, 1500);

        // אם המשתמש עזב את הדף (האפליקציה נפתחה), מבטלים את הגיבוי
        window.addEventListener("pagehide", () => clearTimeout(fallback), { once: true });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) clearTimeout(fallback);
        }, { once: true });

        window.location.href = appUrl;
    } else {
        // בדסקטופ - פשוט פותחים את גרסת הווב בכרטיסייה חדשה
        window.open(webUrl, "_blank");
    }
}

//------------------------------------------------------
// מחיקת עצירת ביניים מרשימת התוצאות ומחשב מחדש (יציאה/סיום לא נמחקים)
//------------------------------------------------------
function deletePoint(point) {
    if (point.role !== "stop") return;
    routePoints = routePoints.filter(p => p !== point);
    recomputeAndRender();
}

//------------------------------------------------------
// רינדור רשימת המסלול - אייקון מחיקה קטן רק על עצירות הביניים
//------------------------------------------------------
function renderRouteList(routeArr) {
    const routeList = document.getElementById("routeList");
    routeList.innerHTML = "";

    routeArr.forEach((p, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "route-wrapper";

        // תווית יציאה/סיום
        if (p.role === "start") {
            const lbl = document.createElement("div");
            lbl.className = "route-label";
            lbl.textContent = "יציאה";
            wrapper.appendChild(lbl);
        } else if (p.role === "end") {
            const lbl = document.createElement("div");
            lbl.className = "route-label";
            lbl.textContent = "סיום";
            wrapper.appendChild(lbl);
        }

        // חץ מודרני מעל הריבוע (לא לפני הנקודה הראשונה)
        if (index > 0) {
            const arrow = document.createElement("div");
            arrow.className = "green-arrow";
            arrow.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M12 4v13M6 12l6 6 6-6" fill="none" stroke="currentColor"
                          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            wrapper.appendChild(arrow);
        }

        // ריבוע הכתובת
        const box = document.createElement("div");
        box.className = "route-item";

        // אייקון מחיקה קטן - רק לעצירות ביניים
        if (p.role === "stop") {
            const delIcon = document.createElement("button");
            delIcon.type = "button";
            delIcon.className = "icon-btn delete-icon";
            delIcon.title = "מחק עצירה";
            delIcon.setAttribute("aria-label", "מחק עצירה");
            delIcon.textContent = "🗑️";
            delIcon.addEventListener("click", () => deletePoint(p));
            box.appendChild(delIcon);
        }

        // טקסט הכתובת
        const addrText = document.createElement("div");
        addrText.className = "route-address";
        addrText.textContent = p.address;

        // כפתור וייז - עם אייקון המותג (קובץ מקומי, עובד גם ללא אינטרנט)
        const wazeBtn = document.createElement("button");
        wazeBtn.className = "waze-btn";
        wazeBtn.innerHTML = `
            <img class="waze-icon" src="icons/waze.svg" alt="Waze" width="20" height="20">
            <span>נווט בוויז</span>
        `;
        wazeBtn.addEventListener("click", () => openWaze(p.lat, p.lon));

        box.appendChild(addrText);
        box.appendChild(wazeBtn);
        wrapper.appendChild(box);

        routeList.appendChild(wrapper);
    });
}

//------------------------------------------------------
// 9. חישוב המסלול (לחיצה ראשונה) - קורא את השדות ובונה את ה-state
//------------------------------------------------------
document.getElementById("drawRouteBtn").addEventListener("click", async () => {
    const startInput = document.getElementById("startAddress");
    const endInput   = document.getElementById("endAddress");

    if (!startInput.value || !endInput.value) {
        alert("יש למלא כתובת יציאה וכתובת חזרה");
        return;
    }

    const start = await geocode(startInput);
    const end   = await geocode(endInput);

    if (!start || !end) {
        alert("שגיאה בגיאוקוד של כתובת יציאה או חזרה");
        return;
    }

    const addressInputs = [...document.querySelectorAll(".address")];
    const stops = (await Promise.all(
        addressInputs.map(input => input.value.trim() ? geocode(input) : null)
    )).filter(x => x);

    // בונים את ה-state עם תפקידים
    routePoints = [
        { ...start, role: "start" },
        ...stops.map(s => ({ ...s, role: "stop" })),
        { ...end, role: "end" }
    ];

    recomputeAndRender();
});



