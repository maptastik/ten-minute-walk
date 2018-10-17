////////////////
// FUNCTIONS //
//////////////
function addListItem(listId, listText) {
  let list = document.getElementById(listId);
  let listItem = document.createElement("li");
  listItem.classList.add("selected-address");
  listItem.innerHTML = listText;
  list.appendChild(listItem);
  
  let listElements = document.querySelectorAll(`#${listId} li.selected-address`)
  listElements[listElements.length - 1].value = listElements.length;
  
  listIndex++;
  addressList = document.getElementById('address-list');
};

function intersectingParksInfo(parks, isochrone, key) {
  let intersectingParksArray = [];
  turf.featureEach(parks, function(currentFeature, featureIndex) {
    if (!turf.booleanDisjoint(currentFeature, isochrone)) {
      intersectingParksArray.push(currentFeature.properties[key])
    }
  });
  
  let uniqueIntersectingParksArray = _.uniq(intersectingParksArray).sort();
  return uniqueIntersectingParksArray;
}

function losFilter(feature) {
  if (feature.properties.LEVEL_OF_SERVICE == 1) return true
}
function createSinglePartParkPolygons(data, filter) {
  if (filter) {
    data = L.geoJson(data, {
      filter: filter
    }).toGeoJSON()
  }
  let singlePartParkPolygons = []
  turf.featureEach(data, function(currentFeature, featureIndex) {
    if (currentFeature.geometry.type == 'Polygon') {
      singlePartParkPolygons.push(currentFeature)
    } else {
      let multiPartGeometry = currentFeature.geometry.coordinates;
      let multiPartProperties = currentFeature.properties;
      multiPartGeometry.forEach(function(item) {
        let singlePartObject = {};
        singlePartObject.type = 'Feature';
        singlePartObject.properties = multiPartProperties;
        singlePartObject.geometry = {
          type: 'Polygon',
          coordinates: item
        };
        singlePartParkPolygons.push(singlePartObject)
      })
    }
  })
  return turf.featureCollection(singlePartParkPolygons);
}

/////////////////
// Set up map //
///////////////
const map = L.map('map', {
  center: [35.798532, -78.644599],
  zoom: 12
});

//////////////
// Globals //
////////////
let mapbox_key = 'pk.eyJ1IjoicHJjcmRldmxhYiIsImEiOiJjamljNWE0Z2owMGJjM2tzM3gxYmRrNXZnIn0.exFKTScPuDEIqeY-Rv36gQ'

let greenwaysDataUrl = 'https://opendata.arcgis.com/datasets/23836bb9145943d485252d9665020ff1_0.geojson'
let greenwaysJSON;

// let parksDataUrl = 'https://opendata.arcgis.com/datasets/43b5d6bf9d6e400599498d052545d331_0.geojson';
let parksDataUrl = 'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Parks_with_Analysis_Tiers/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
let parksJSON;
let singlePartParkPolygonsJSON;

let papDataUrl = 'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Park_Access_Points/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
let papJSON;
let papLayer;

let tenMinuteWalk = L.featureGroup().addTo(map);
let tenMinuteClick = L.featureGroup().addTo(map);
let selectedLocation = L.featureGroup().addTo(map);
let hoverPark = L.featureGroup().addTo(map);
let listIndex = 0;

let panes = [{name: 'parks', z: 402}, {name: 'greenways', z: 403}, {name: 'walks', z: 404}, {name: 'walk_selected', z: 405},
             {name: 'parks_hover', z: 407}, {name: 'labels', z: 450}, {name: 'pap', z: 451}, {name: 'walks_click', z: 452}]

for (let i = 0; i < panes.length; i++) {
  map.createPane(panes[i].name)
  map.getPane(panes[i].name).style.zIndex = panes[i].z
}

///////////////
// ADD DATA //
/////////////
const basemap = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
	subdomains: 'abcd',
	maxZoom: 19
}).addTo(map);

const labels = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
	subdomains: 'abcd',
	maxZoom: 19,
  pane: 'labels'
}).addTo(map);

Promise.all([
  d3.json(greenwaysDataUrl),
  d3.json(parksDataUrl),
  d3.json(papDataUrl)
]).then(([greenwaysData, parksData, papData]) => {
  
  // GREENWAYS   
  greenwaysLayer = L.geoJson(greenwaysData, {
    weight: 0.75,
    color: '#FFC107',
    pane: 'greenways',
    opacity: 1
  }).addTo(map)
  
  // PARK POLYGONS
  // Convert parks into single part polygons
  singlePartParkPolygonsJSON = createSinglePartParkPolygons(parksData, losFilter)  
  parksJSON = L.geoJson(singlePartParkPolygonsJSON).toGeoJSON()
  
  parksLayer = L.geoJson(parksJSON, {
    fillColor: '#1B5E20',
    fillOpacity: 0.4,
    weight: 0,
    pane: 'parks'
  }).addTo(map)
  
  // PARK ACCESS POINTS
  let parkIDArray = [];
  for (let i = 0; i < parksJSON.features.length; i++) {
    parkIDArray.push(parksJSON.features[i].properties.PARKID);
  }
  parkIDArray = _.uniq(parkIDArray).sort();  
  function papFilter(feature) {
    if (parkIDArray.includes(feature.properties.PARKID)) return true
  }
  
  papJSON = L.geoJson(papData, {
    filter: papFilter
  }).toGeoJSON();
  
  papLayer = L.geoJson(papJSON, {
    pointToLayer: function(feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 1.5,
        fillColor: '#1B5E20',
        fillOpacity: 1,
        weight: 0,
        pane: 'pap'
      })
    }
  });
  
  L.control.layers('', {"Park Access Points": papLayer}).addTo(map)
  
})

//////////////////
// INTERACTION //
////////////////
map.on('click', function(e) {
  let clickLat = e.latlng.lat
  let clickLng = e.latlng.lng
  let reverseGeocodeString = `https://api.mapbox.com/geocoding/v5/mapbox.places/${clickLng},${clickLat}.json?access_token=${mapbox_key}`
  let isochroneRequestString = `https://api.mapbox.com/isochrone/v1/mapbox/walking/${clickLng},${clickLat}?contours_minutes=10&contours_colors=6706ce&polygons=true&access_token=${mapbox_key}`
    
  Promise.all([
    d3.json(reverseGeocodeString),
    d3.json(isochroneRequestString)
  ]).then(([reverseGeocodeData, tenMinuteWalkData]) => {
    if (tenMinuteWalkData.features[0].geometry.coordinates.length > 0) {
      // parkNames = intersectingParksInfo(singlePartParkPolygonsJSON, tenMinuteWalkData, "NAME");
      parkNames = intersectingParksInfo(papJSON, tenMinuteWalkData, "PARK_NAME");
      
        let addressText = reverseGeocodeData.features[0].place_name.split(',')[0]
        let addressParkString = `${addressText}<ul>`;
      if (parkNames.length > 0) {
        for (let i = 0; i < parkNames.length; i++) {
          addressParkString+=`<li class="park-name">${parkNames[i]}</li>`
        }
      } else {
        addressParkString+='<li class="park-name">No parks within a 10-minute walk.</li>'
      }
      addressParkString+='</ul>'
      addListItem("address-list", addressParkString);
            
      let tenMinuteWalkLayer = L.geoJson(tenMinuteWalkData, {
        color: '#323232',
        fillOpacity: 0,
        weight: 2,
        dashArray: '5, 5',
        pane: 'walks'
      });
      tenMinuteWalk.addLayer(tenMinuteWalkLayer)

      let clickLayer = L.geoJson(turf.point([clickLng, clickLat]), {
        pointToLayer: function(feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 4,
            fillColor: '#323232',
            fillOpacity: 1,
            weight: 0,
            pane: 'walks_click'
          })
        }
      })
      tenMinuteClick.addLayer(clickLayer);
    } else {
      alert('Could not generate an isochrone for the selected location.')
    }
  })
})

let clearLayersButton = document.getElementById('clear-layers-button');
clearLayersButton.addEventListener('click', function() {
  let addressList = document.getElementById("address-list");
  addressList.innerHTML = '';
  
  tenMinuteWalk.clearLayers();
  tenMinuteClick.clearLayers();
  selectedLocation.clearLayers();
  hoverPark.clearLayers();
  listIndex = 0;
})

let addressList = document.getElementById('address-list');
addressListItem = document.getElementById("address-list");

addressList.onmouseover = function(e) {
  selectedLocation.clearLayers();
  hoverPark.clearLayers();
  
  let addressItemValue = e.target.value;
  if (addressItemValue) {
    let tenMinuteWalkJSON = tenMinuteWalk.toGeoJSON();
    let selectedWalk = tenMinuteWalkJSON.features[addressItemValue - 1] 
    selectedLocation.addLayer(L.geoJson(selectedWalk, {
      color: '#FFEB3B',
      weight: 2,
      fillOpacity: 0.5,
      pane: 'walk_selected'
    }))
  } else {
    function hoverParkFilter(feature) {
      if (feature.properties.NAME === e.target.innerText) return true
    }
    hoverPark.addLayer(L.geoJson(parksJSON, {
      filter: hoverParkFilter,
      color: "#1B5E20",
      fillOpacity: 0.75,
      weight: 1
    }))
  }
}

addressList.onclick = function(e) {
  if (e.path[0].value) {
    map.flyToBounds(selectedLocation.getBounds());
    let selectedLocationJSON = selectedLocation.toGeoJSON();
  }
}