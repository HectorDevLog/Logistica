// =========================================================================
// MOTOR MATEMÁTICO DE TARIFAS v4.3 - FLEXNET (Especial Zippak)
// =========================================================================

function calcularTarifasAutomaticas(p) {
    let cliente = String(p['Cliente'] || '').trim().toUpperCase();
    
    let trayectoOriginal = String(p['TipoTrayecto'] || p['Tipo_Trayecto'] || p['Trayecto'] || '').trim().toUpperCase();
    let trayecto = (trayectoOriginal === '' || trayectoOriginal === '-') ? 'LOCAL' : trayectoOriginal;

    let origenOriginal = String(p['Origen'] || p['ORIGEN'] || p['Ciudad'] || p['Ciudad_Origen'] || '').trim().toUpperCase();
    let origen = (origenOriginal === '' || origenOriginal === '-') ? 'QUITO' : origenOriginal;
    let destino = String(p['Destino'] || p['DESTINO'] || p['Localidad'] || p['CP'] || '').trim().toUpperCase();

    let servicioInput = String(p['Tipo_Servicio'] || p['TipoServicio'] || 'NORMAL').trim().toUpperCase();
    let servicioBusqueda = (servicioInput.includes('EXCLUSIVO') || servicioInput.includes('DEDICADO')) ? 'EXCLUSIVO' : 'NORMAL';

    let peso = parseFloat(p['peso_total_kg']) || parseFloat(p['PesoKg']) || parseFloat(p['Peso']) || 0;
    let bultos = parseInt(p['cantidad_bultos'] || p['Cantidad_Bultos'] || p['Bultos'] || 1);

    // 🔥 REGLA: Si el peso supera los 500kg, se vuelve EXCLUSIVO obligatoriamente (EXCEPTO ZIPPAK)
    if (peso > 500 && cliente !== 'ZIPPAK') {
        servicioBusqueda = 'EXCLUSIVO';
    }

    let res = { tfaPeso: 0, tfaPedido: 0, tfaRango: 0, tfaMedida: 0, total: 0, trayUsado: trayecto, pesoUsado: peso };

    const leerNum = (val) => {
        if(!val || val === '-' || val === '') return 0;
        return parseFloat(String(val).replace('$', '').replace(/\s/g, '').replace(',', '.')) || 0;
    };

    // 🛠️ HELPER ANTI-ESPACIOS INVISIBLES
    const extraerDatoColumna = (filaExcel, nombreBuscado) => {
        let keyEncontrada = Object.keys(filaExcel).find(k => String(k).trim().toUpperCase() === nombreBuscado.toUpperCase());
        return keyEncontrada ? String(filaExcel[keyEncontrada]).trim().toUpperCase() : '';
    };

    // =========================================================================
    // 📦 LÓGICA ESPECIAL: ZIPPAK (Bloques de 690kg = $112.50)
    // =========================================================================
    if (cliente === 'ZIPPAK') {
        // Se calcula en bloques: 1 a 690kg = 1 bloque. 691 a 1380 = 2 bloques, etc.
        let bloques = Math.ceil(peso / 690);
        if (bloques < 1) bloques = 1; // Si el peso es 0, al menos cobra 1 bloque base
        
        let tarifaZippak = bloques * 112.50;
        
        res.tfaRango = tarifaZippak;
        res.total = tarifaZippak;
        return res; // Retorna inmediatamente sin pasar por las otras lógicas
    }

    // =========================================================================
    // 🚛 LÓGICA 0: EXCLUSIVOS (Por peso >500kg o explícitos en monitor)
    // =========================================================================
    if (servicioBusqueda === 'EXCLUSIVO') {
        if (window.tarifaExclusivosDB && window.tarifaExclusivosDB.length > 0) {
            
            let matchExclusivo = window.tarifaExclusivosDB.find(t => {
                let tCli = extraerDatoColumna(t, 'CLIENTE');
                let tOri = extraerDatoColumna(t, 'ORIGEN');
                let tDes = extraerDatoColumna(t, 'DESTINO');
                return tCli === cliente && tOri === origen && tDes === destino;
            });

            if (matchExclusivo) {
                // Buscamos la columna de 1 tonelada asegurándonos de atrapar cualquier variante
                let key1Ton = Object.keys(matchExclusivo).find(k => {
                    let clean = String(k).trim().toUpperCase();
                    return clean === '1 TON' || clean === '1 TONELADA' || clean === '1TON';
                });
                
                let tarifa1Ton = key1Ton ? leerNum(matchExclusivo[key1Ton]) : 0;
                
                if (tarifa1Ton > 0) {
                    res.tfaPedido = tarifa1Ton; 
                    res.total = tarifa1Ton;
                    return res; // ⛔ CORTA LA FUNCIÓN AQUÍ
                }
            }
        }
    }

    // =========================================================================
    // 🌟 LÓGICA 1: INTERCEPTOR DE CLIENTES ESPECIALES (Tfa_Medida consolidado)
    // =========================================================================
    if (window.tfaMedidaDB && window.tfaMedidaDB.length > 0) {
        let reglasCliente = window.tfaMedidaDB.filter(r => 
            String(r['Cliente (AN)'] || r.Cliente || '').trim().toUpperCase() === cliente
        );

        if (reglasCliente.length > 0) {
            let tarifaFinalEspecial = 0;
            let aplicoTarifaEspecial = false;
            
            let regla = reglasCliente.find(r => String(r['Trayecto (AQ)'] || r.Trayecto || '').trim().toUpperCase() === trayecto);

            if (regla) {
                let precio = leerNum(regla['Tarifa (AR)'] || regla.Tarifa);
                let detalle = String(regla['Detalle / Regla (AS)'] || regla['Detalle / Regla'] || '').toUpperCase();

                if (detalle.includes("POR CADA KG") || detalle.includes("POR KG")) {
                    tarifaFinalEspecial = precio * peso;
                    aplicoTarifaEspecial = true;
                } else if (detalle.includes("CAJA") || detalle.includes("BULTO")) {
                    if (detalle.includes("MAX 9") && bultos > 9) {
                        let reglaTruck = reglasCliente.find(r => String(r['Trayecto (AQ)'] || r.Trayecto || '').toUpperCase() === "TRUCK 1");
                        tarifaFinalEspecial = reglaTruck ? leerNum(reglaTruck['Tarifa (AR)'] || reglaTruck.Tarifa) : 100.68;
                    } else {
                        tarifaFinalEspecial = precio * bultos; 
                    }
                    aplicoTarifaEspecial = true;
                } else {
                    tarifaFinalEspecial = precio;
                    aplicoTarifaEspecial = true;
                }
            }

            let reglaEstiba = reglasCliente.find(r => String(r['Trayecto (AQ)'] || r.Trayecto || '').toUpperCase() === "ESTIBAS");
            if (reglaEstiba) {
                let detalleEstiba = String(reglaEstiba['Detalle / Regla (AS)'] || reglaEstiba['Detalle / Regla'] || '').toUpperCase();
                if (detalleEstiba.includes("22KG") && peso > 22) {
                    tarifaFinalEspecial += leerNum(reglaEstiba['Tarifa (AR)'] || reglaEstiba.Tarifa);
                    aplicoTarifaEspecial = true;
                }
            }

            if (aplicoTarifaEspecial) {
                res.tfaMedida = tarifaFinalEspecial;
                res.total = tarifaFinalEspecial;
                return res;
            }
        }
    }

    // =========================================================================
    // 🚀 LÓGICA 2: COURIER (Cobro por Peso / Tfa_Peso)
    // =========================================================================
    if (servicioBusqueda === 'NORMAL') {
        let tPesoConf = window.tfaPesoDB.find(t => 
            String(t['Cliente']).trim().toUpperCase() === cliente && 
            String(t['TRAYECTO']).trim().toUpperCase() === trayecto
        );

        if (tPesoConf) {
            let arranque = leerNum(tPesoConf['ARRANQUE']);
            let tarifaBase = leerNum(tPesoConf['TARIFA']);
            let kgAdicional = leerNum(tPesoConf['KG ADICIONAL']);

            if (peso <= arranque) res.tfaPeso = tarifaBase;
            else {
                let excesoKilos = peso - arranque;
                res.tfaPeso = tarifaBase + (excesoKilos * kgAdicional);
            }
        }
    }

    // =========================================================================
    // 📦 LÓGICA 3: TARIFA POR PEDIDO (Cobro Fijo / Tfa_Pedido)
    // =========================================================================
    let matchPedido = window.tfaPedidoDB.find(t => 
        String(t['Cliente']).trim().toUpperCase() === cliente &&
        String(t['SERVICIO']).trim().toUpperCase() === servicioBusqueda &&
        String(t['TRAYECTO']).trim().toUpperCase() === trayecto
    );

    if (matchPedido) {
        res.tfaPedido = leerNum(matchPedido['TARIFA']);
    }

    // =========================================================================
    // 📊 LÓGICA 4: TARIFA POR RANGO DE PESO (Tfa_Rango)
    // =========================================================================
    if (servicioBusqueda !== 'EXCLUSIVO') {
        let matchRango = window.tfaRangoDB.find(t => 
            String(t['CLIENTE']).trim().toUpperCase() === cliente &&
            String(t['TRAYECTO']).trim().toUpperCase() === trayecto
        );

        if (matchRango) {
            let colRango = "";
            if (peso <= 5) colRango = "(hasta 5 kg)";
            else if (peso <= 10) colRango = "(hasta 10 kg)";
            else if (peso <= 15) colRango = "(hasta 15 kg)";
            else if (peso <= 20) colRango = "(hasta 20 kg)";
            else if (peso <= 30) colRango = "(hasta 30 kg)";
            else if (peso <= 50) colRango = "(hasta 50 kg)";
            else if (peso <= 70) colRango = "(hasta 70 kg)";
            else if (peso <= 100) colRango = "(hasta 100 kg)";
            else colRango = "(hasta 150 kg)"; 

            let tarifaBaseRango = leerNum(matchRango[colRango]);

            // Regla de 3 para MIRGOR si pasa de 150kg
            if (peso > 150 && cliente === 'MIRGOR') {
                let tarifaMaxima = leerNum(matchRango["(hasta 150 kg)"]);
                res.tfaRango = (peso * tarifaMaxima) / 150;
            } else {
                res.tfaRango = tarifaBaseRango;
            }
        }
    }

    res.total = res.tfaPeso + res.tfaPedido + res.tfaRango + res.tfaMedida;
    return res;
}