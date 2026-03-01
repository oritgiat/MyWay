const GOOGLE_API_KEY = "AIzaSyAnTZ17FYB-LhAQwxMkTd7yPUj8HSns2Pw";

//------------------------------------------------------
// 1. פונקציה שמוסיפה יכולת Autocomplete לכל שדה כתובת
//------------------------------------------------------
function attachAutocomplete(input) {
    const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ["address"],
        componentRestrictions: { country: "il" } // ישראל בלבד
    });
    autocomplete.setFields(["formatted_address", "geometry"]);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;
        input.dataset.lat = place.geometry.location.lat();
        input.dataset.lng = place.geometry.location.lng();
        input.value = place.formatted_address;
    });
}

//------------------------------------------------------
// 2. גיאוקוד לכתובת
//------------------------------------------------------
// async function geocode(address) {
//     // אם כבר יש קואורדינטות משדה autocomplete
//     const input = document.querySelector(`input[value="${address}"]`);
//     if (input && input.dataset.lat && input.dataset.lng) {
//         return {
//             lat: parseFloat(input.dataset.lat),
//             lon: parseFloat(input.dataset.lng),
//             address: address
//         };
//     }

async function geocode(inputElement) {

    const address = inputElement.value;

    // אם כבר יש קואורדינטות מ-autocomplete
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

    // קריאה ל-Google Geocoding API
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}&language=he`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) return null;

    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lon: loc.lng, address: data.results[0].formatted_address };
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
});
// מפה ראשונית כבר מהטעינה
window.map = L.map("map").setView([31.5, 34.8], 8); // מרכז על ישראל
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(window.map);

//------------------------------------------------------
// 8. חישוב המסלול וציור על מפה
//------------------------------------------------------
document.getElementById("drawRouteBtn").addEventListener("click", async () => {

    const startAddr = document.getElementById("startAddress").value;
    const endAddr   = document.getElementById("endAddress").value;

    if (!startAddr || !endAddr) {
        alert("יש למלא כתובת יציאה וכתובת חזרה");
        return;
    }

    const addressInputs = [...document.querySelectorAll(".address")];
    const addresses = addressInputs
                        .map(i => i.value)
                        .filter(a => a.trim() !== "");

    // גיאוקוד
    //const start = await geocode(startAddr);
    const startInput = document.getElementById("startAddress");
const endInput   = document.getElementById("endAddress");

const start = await geocode(startInput);
const end   = await geocode(endInput);

const stops = (await Promise.all(
    addressInputs.map(input => geocode(input))
)).filter(x => x);
   // const end   = await geocode(endAddr);
   // const stops = (await Promise.all(addresses.map(geocode))).filter(x => x);

    if (!start || !end) {
        alert("שגיאה בגיאוקוד של כתובת יציאה או חזרה");
        return;
    }

    // חישוב מסלול אופטימלי
    const bestStops = findBestOrder(start, end, stops);

    // מסלול סופי
    const fullRoute = [start, ...bestStops, end];

    //--------------------------------------------------
    // הצגת רשימת המסלול (OL)
    //--------------------------------------------------
    const list = document.getElementById("routeList");
    list.innerHTML = "";

    fullRoute.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.address;
        list.appendChild(li);
    });
    renderRouteList(fullRoute); 


    //--------------------------------------------------
    // הצגת המסלול על המפה
    //--------------------------------------------------
    if (window.routeLayer) {
        window.routeLayer.remove();
    }

    const latlngs = fullRoute.map(p => [p.lat, p.lon]);

    // 2. מוסיפים polyline חדש
    window.routeLayer = L.polyline(latlngs, {color:"blue"}).addTo(window.map);

    // 3. מוחקים markers ישנים
    if (window.markers) {
        window.markers.forEach(m => m.remove());
    }

    // 4. מוסיפים markers חדשים
    window.markers = fullRoute.map(p => 
        L.marker([p.lat, p.lon]).addTo(window.map)
            .bindPopup(p.address)
    );

    // 5. מתאים את המפה כך שתכסה את כל המסלול
    const bounds = L.latLngBounds(latlngs);
    window.map.fitBounds(bounds, {padding: [50, 50]});

   function renderRouteList(routeArr) {
    const routeList = document.getElementById("routeList");
    routeList.innerHTML = "";

    routeArr.forEach((p, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "route-wrapper";

        // יציאה/סיום
        if (index === 0) {
            const lbl = document.createElement("div");
            lbl.className = "route-label";
            lbl.textContent = "יציאה";
            wrapper.appendChild(lbl);
        }

        if (index === routeArr.length - 1) {
            const lbl = document.createElement("div");
            lbl.className = "route-label";
            lbl.textContent = "סיום";
            wrapper.appendChild(lbl);
        }

        // חץ ירוק מחוץ לריבוע
        const arrow = document.createElement("div");
        arrow.className = "green-arrow";
        arrow.textContent = "⬇";
        wrapper.appendChild(arrow);

        // ריבוע הכתובת
        const box = document.createElement("div");
        box.className = "route-item";
        box.innerHTML = `
            ${p.address}
            <br>
            <button class="waze-btn">נווט בוויז</button>
        `;
        wrapper.appendChild(box);

        // כפתור וויז
        box.querySelector(".waze-btn").addEventListener("click", () => {
        window.open(`https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`, "_blank");        });

        routeList.appendChild(wrapper);
    });
}




});
