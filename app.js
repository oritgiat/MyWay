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
// 7. הוספת כתובת עצירה חדשה + autocomplete + שדה הערות
//------------------------------------------------------
document.getElementById("addAddressBtn").addEventListener("click", () => {
    const container = document.getElementById("addresses-container");

    // עטיפה לכל עצירה: כתובת + כפתור הרחבה + הערות
    const stopWrapper = document.createElement("div");
    stopWrapper.className = "stop-block";

    // שורת הכתובת עם חץ הרחבה
    const addrRow = document.createElement("div");
    addrRow.className = "address-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "address";
    input.placeholder = "כתובת עצירה";

    // כפתור חץ לפתיחת/סגירת ההערות
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "note-toggle";
    toggleBtn.title = "הוסף הערה";
    toggleBtn.setAttribute("aria-label", "הוסף הערה");
    toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor"
                  stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;

    // כפתור X להסרת העצירה מרשימת הקלט
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "stop-remove";
    removeBtn.title = "הסר עצירה";
    removeBtn.setAttribute("aria-label", "הסר עצירה");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => removeStopBlock(stopWrapper));

    const note = document.createElement("textarea");
    note.className = "address-note";
    note.rows = 2;
    note.placeholder = "הערות (למשל: שם, קומה, קוד כניסה)";

    // פתיחה/סגירה של ההערות
    toggleBtn.addEventListener("click", () => {
        const isOpen = stopWrapper.classList.toggle("note-open");
        if (isOpen) note.focus();
    });

    addrRow.appendChild(input);
    addrRow.appendChild(toggleBtn);
    addrRow.appendChild(removeBtn);
    stopWrapper.appendChild(addrRow);
    stopWrapper.appendChild(note);
    container.appendChild(stopWrapper);

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
// פתיחת ניווט בוויז - פותח ישירות את אפליקציית וויז אם היא מותקנת
//------------------------------------------------------
function openWaze(lat, lon) {
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const webUrl = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;

    if (isAndroid) {
        // Android intent: פותח את אפליקציית וויז ישירות, ואם לא מותקנת -
        // נופל אוטומטית לגרסת הווב (browser_fallback_url). ללא טיימרים.
        const intentUrl =
            `intent://waze.com/ul?ll=${lat},${lon}&navigate=yes#Intent;` +
            `scheme=https;package=com.waze;` +
            `S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
        window.location.href = intentUrl;
    } else if (isIOS) {
        // iOS: deep link ישיר לאפליקציה
        window.location.href = `waze://?ll=${lat},${lon}&navigate=yes`;
    } else {
        // דסקטופ: גרסת ווב בכרטיסייה חדשה
        window.open(webUrl, "_blank");
    }
}

//------------------------------------------------------
// מחיקת עצירת ביניים מרשימת התוצאות - מוחקת גם את שדה הקלט המקושר
//------------------------------------------------------
function deletePoint(point) {
    if (point.role !== "stop") return;
    // מסירים גם את שדה הקלט (.stop-block) שקושר לנקודה, אם קיים
    if (point.el && point.el.parentElement) {
        point.el.remove();
    }
    routePoints = routePoints.filter(p => p !== point);
    recomputeAndRender();
}

//------------------------------------------------------
// הסרת עצירה מרשימת הקלט (כפתור X). אם המסלול כבר חושב -
// מסירים גם מהתוצאות ומחשבים מחדש כדי לשמור על סנכרון.
//------------------------------------------------------
function removeStopBlock(stopBlock) {
    // אם הנקודה קיימת ב-state של המסלול המחושב - נסיר גם משם
    const linked = routePoints.find(p => p.el === stopBlock);
    stopBlock.remove();

    if (linked) {
        routePoints = routePoints.filter(p => p !== linked);
        recomputeAndRender();
    }
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

        box.appendChild(addrText);

        // הערת המשתמש (אם קיימת) - שם, קומה, קוד כניסה וכו'
        if (p.note) {
            const noteText = document.createElement("div");
            noteText.className = "route-note";
            noteText.textContent = p.note;
            box.appendChild(noteText);
        }

        // כפתור וייז - עם אייקון המותג (קובץ מקומי, עובד גם ללא אינטרנט)
        const wazeBtn = document.createElement("button");
        wazeBtn.className = "waze-btn";
        wazeBtn.innerHTML = `
            <img class="waze-icon" src="icons/waze.svg" alt="Waze" width="20" height="20">
            <span>נווט בוויז</span>
        `;
        wazeBtn.addEventListener("click", () => openWaze(p.lat, p.lon));

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

    // עצירות ביניים: לכל שדה כתובת מלא, נגאוקד ונצרף את ההערה שלו
    const addressInputs = [...document.querySelectorAll("#addresses-container .address")];
    const stopResults = await Promise.all(addressInputs.map(async (input) => {
        if (!input.value.trim()) return null;
        const geo = await geocode(input);
        if (!geo) return null;
        // ההערה נמצאת ב-textarea שבתוך עטיפת ה-.stop-block (הקרובה ביותר)
        const stopBlock = input.closest(".stop-block");
        const noteEl = stopBlock ? stopBlock.querySelector(".address-note") : null;
        const note = noteEl ? noteEl.value.trim() : "";
        // el = הפניה לשדה הקלט, לצורך סנכרון מחיקה בין הרשימות
        return { ...geo, note, role: "stop", el: stopBlock };
    }));
    const stops = stopResults.filter(x => x);

    // בונים את ה-state עם תפקידים (הערות רק לעצירות ביניים)
    routePoints = [
        { ...start, role: "start" },
        ...stops,
        { ...end, role: "end" }
    ];

    recomputeAndRender();
});



