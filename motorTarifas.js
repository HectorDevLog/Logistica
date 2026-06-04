// =========================================================================
// MOTOR MATEMÁTICO DE TARIFAS v3.0 - FLEXNET
// =========================================================================

function calcularTarifasAutomaticas(p) {
    // 1. Extraer y limpiar datos básicos
    let cliente = String(p['Cliente'] || '').trim().toUpperCase();
    
    // Trayecto con parche de seguridad para vacíos/guiones
    let trayectoOriginal = String(p['TipoTrayecto'] || p['Tipo_Trayecto'] || p['Trayecto'] || '').trim().toUpperCase();
    let trayecto = (trayectoOriginal === '' || trayectoOriginal === '-') ? 'LOCAL' : trayectoOriginal;

    // Normalizar Servicio (NORMAL y afines vs EXCLUSIVO)
    let servicioInput = String(p['Tipo_Servicio'] || p['TipoServicio'] || 'NORMAL').trim().toUpperCase();
    let servicioBusqueda = (servicioInput.includes('EXCLUSIVO') || servicioInput.includes('DEDICADO')) ? 'EXCLUSIVO' : 'NORMAL';

    let peso = parseFloat(p['peso_total_kg']) || parseFloat(p['PesoKg']) || parseFloat(p['Peso']) || 0;
    
    // Variable necesaria para las reglas de cajas
    let bultos = parseInt(p['cantidad_bultos'] || p['Cantidad_Bultos'] || p['Bultos'] || 1);

    // Objeto de respuesta
    let res = { tfaPeso: 0, tfaPedido: 0, tfaRango: 0, tfaMedida: 0, total: 0, trayUsado: trayecto, pesoUsado: peso };

    // Función de limpieza de números (Quita $, comas y espacios)
    const leerNum = (val) => {
        if(!val || val === '-' || val === '') return 0;
        return parseFloat(String(val).replace('$', '').replace(/\s/g, '').replace(',', '.')) || 0;
    };

    // =========================================================================
    // 🔥 NUEVA LÓGICA 0: INTERCEPTOR DE CLIENTES ESPECIALES (Tfa_Medida consolidado)
    // =========================================================================
    if (window.tfaMedidaDB && window.tfaMedidaDB.length > 0) {
        // Buscamos si el cliente actual tiene reglas en la pestaña Tfa_Medida
        let reglasCliente = window.tfaMedidaDB.filter(r => 
            String(r['Cliente (AN)'] || r.Cliente || '').trim().toUpperCase() === cliente
        );

        if (reglasCliente.length > 0) {
            let tarifaFinalEspecial = 0;
            let aplicoTarifaEspecial = false;
            
            // 1. Buscamos la regla principal del trayecto
            let regla = reglasCliente.find(r => 
                String(r['Trayecto (AQ)'] || r.Trayecto || '').trim().toUpperCase() === trayecto
            );

            if (regla) {
                let precio = leerNum(regla['Tarifa (AR)'] || regla.Tarifa);
                let detalle = String(regla['Detalle / Regla (AS)'] || regla['Detalle / Regla'] || '').toUpperCase();

                if (detalle.includes("POR CADA KG") || detalle.includes("POR KG")) {
                    tarifaFinalEspecial = precio * peso;
                    aplicoTarifaEspecial = true;
                } 
                else if (detalle.includes("CAJA") || detalle.includes("BULTO")) {
                    if (detalle.includes("MAX 9") && bultos > 9) {
                        // Salta a cobrar como TRUCK 1 si pasa de 9 bultos
                        let reglaTruck = reglasCliente.find(r => String(r['Trayecto (AQ)'] || r.Trayecto || '').toUpperCase() === "TRUCK 1");
                        tarifaFinalEspecial = reglaTruck ? leerNum(reglaTruck['Tarifa (AR)'] || reglaTruck.Tarifa) : 100.68;
                    } else {
                        tarifaFinalEspecial = precio * bultos; // Cobro normal por caja
                    }
                    aplicoTarifaEspecial = true;
                } 
                else {
                    // Si dice "Tarifa Plana" o está vacío, cobra directo el valor
                    tarifaFinalEspecial = precio;
                    aplicoTarifaEspecial = true;
                }
            }

            // 2. Buscamos si hay regla de "ESTIBAS" para sumar al total
            let reglaEstiba = reglasCliente.find(r => String(r['Trayecto (AQ)'] || r.Trayecto || '').toUpperCase() === "ESTIBAS");
            if (reglaEstiba) {
                let detalleEstiba = String(reglaEstiba['Detalle / Regla (AS)'] || reglaEstiba['Detalle / Regla'] || '').toUpperCase();
                if (detalleEstiba.includes("22KG") && peso > 22) {
                    tarifaFinalEspecial += leerNum(reglaEstiba['Tarifa (AR)'] || reglaEstiba.Tarifa);
                    aplicoTarifaEspecial = true;
                }
            }

            // Si se aplicó alguna regla especial, retornamos el cálculo y cortamos la función aquí
            if (aplicoTarifaEspecial) {
                res.tfaMedida = tarifaFinalEspecial;
                res.total = tarifaFinalEspecial;
                return res;
            }
        }
    }

    // =========================================================================
    // 🚀 LÓGICA 1: COURIER (Cobro por Peso / Tfa_Peso)
    // Solo aplica para servicios de tipo NORMAL
    // =========================================================================
    if (servicioBusqueda === 'NORMAL') {
        let tPesoConf = tfaPesoDB.find(t => 
            String(t['Cliente']).trim().toUpperCase() === cliente && 
            String(t['TRAYECTO']).trim().toUpperCase() === trayecto
        );

        if (tPesoConf) {
            let arranque = leerNum(tPesoConf['ARRANQUE']);
            let tarifaBase = leerNum(tPesoConf['TARIFA']);
            let kgAdicional = leerNum(tPesoConf['KG ADICIONAL']);

            if (peso <= arranque) {
                res.tfaPeso = tarifaBase;
            } else {
                let excesoKilos = peso - arranque;
                res.tfaPeso = tarifaBase + (excesoKilos * kgAdicional);
            }
        }
    }

    // =========================================================================
    // 📦 LÓGICA 2: TARIFA POR PEDIDO (Cobro Fijo / Tfa_Pedido)
    // Busca el cruce exacto: Cliente + Servicio (NORMAL/EXCLUSIVO) + Trayecto
    // =========================================================================
    let matchPedido = tfaPedidoDB.find(t => 
        String(t['Cliente']).trim().toUpperCase() === cliente &&
        String(t['SERVICIO']).trim().toUpperCase() === servicioBusqueda &&
        String(t['TRAYECTO']).trim().toUpperCase() === trayecto
    );

    if (matchPedido) {
        res.tfaPedido = leerNum(matchPedido['TARIFA']);
    }

    // =========================================================================
    // 📊 LÓGICA 3: TARIFA POR RANGO DE PESO (Tfa_Rango)
    // Aplica para servicios NORMALES (Ej. QUIMERCO)
    // =========================================================================
    if (servicioBusqueda !== 'EXCLUSIVO') {
        let matchRango = tfaRangoDB.find(t => 
            String(t['CLIENTE']).trim().toUpperCase() === cliente &&
            String(t['TRAYECTO']).trim().toUpperCase() === trayecto
        );

        if (matchRango) {
            let colRango = "";
            
            // Evaluamos en qué cubeta de peso cae el pedido
            if (peso <= 5) colRango = "(hasta 5 kg)";
            else if (peso <= 10) colRango = "(hasta 10 kg)";
            else if (peso <= 15) colRango = "(hasta 15 kg)";
            else if (peso <= 20) colRango = "(hasta 20 kg)";
            else if (peso <= 30) colRango = "(hasta 30 kg)";
            else if (peso <= 50) colRango = "(hasta 50 kg)";
            else if (peso <= 70) colRango = "(hasta 70 kg)";
            else if (peso <= 100) colRango = "(hasta 100 kg)";
            else colRango = "(hasta 150 kg)"; // Tope máximo de la tabla

            res.tfaRango = leerNum(matchRango[colRango]);
        }
    }

    // =========================================================================
    // FINAL: El sistema suma todas las tarifas encontradas.
    // =========================================================================
    res.total = res.tfaPeso + res.tfaPedido + res.tfaRango + res.tfaMedida;
    
    return res;
}