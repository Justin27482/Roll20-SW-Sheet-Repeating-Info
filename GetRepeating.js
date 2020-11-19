on('ready', ()=>{


	const attrLookup = (character,name,caseSensitive) => {
        let match=name.match(/^(repeating_.*)_\$(\d+)_.*$/);
        if(match){
            let index=match[2],
                attrMatcher=new RegExp(`^${name.replace(/_\$\d+_/,'_([-\\da-zA-Z]+)_')}$`,(caseSensitive?'':'i')),
                createOrderKeys=[],
                attrs=_.chain(findObjs({type:'attribute', characterid:character.id}))
                    .map((a)=>{
                        return {attr:a,match:a.get('name').match(attrMatcher)};
                    })
                    .filter((o)=>o.match)
                    .each((o)=>createOrderKeys.push(o.match[1]))
                    .reduce((m,o)=>{ m[o.match[1]]=o.attr; return m;},{})
                    .value(),
                sortOrderKeys = _.chain( ((findObjs({
                        type:'attribute',
                        characterid:character.id,
                        name: `_reporder_${match[1]}`
                    })[0]||{get:_.noop}).get('current') || '' ).split(/\s*,\s*/))
                    .intersection(createOrderKeys)
                    .union(createOrderKeys)
                    .value();
            if(index<sortOrderKeys.length && _.has(attrs,sortOrderKeys[index])){
                return attrs[sortOrderKeys[index]];
            }
            return;
        } 
        return findObjs({ type:'attribute', characterid:character.id, name: name}, {caseInsensitive: !caseSensitive})[0];
    };

    const keyFormat = (text) => `${text}`.toLowerCase().replace(/\s+/g,'');
    const matchKey = (keys,subject) => subject && !_.isUndefined(_.find(keys,(o)=>(-1 !== subject.indexOf(o))));
	
	const getCharsForFragments = (frag) => {
		let keys = (Array.isArray(frag) ? frag : [frag]).map(keyFormat);
      return findObjs({type:'character'})
        .filter(c=>matchKey(keys,keyFormat(c.get('name'))));
	};

	const getRowIdsForOps = (c,op) => {
		
		if(op.hasOwnProperty("index")){
			// find by offset
			let r = new RegExp(`^(repeating_${op.section})_([^_]*)_(.*)$`,'i');

			let attr = findObjs({
				type: 'attribute',
				characterid: c.id
			}).find(a=>r.test(a.get('name')));

			if(attr){
				let parts = attr.get('name').match(r);
				let lookupName = `${parts[1]}_$${op.index}_${parts[3]}`;
				let attr2 = attrLookup(c, lookupName);
				if(attr2){
					let parts2 = attr2.get('name').match(r);
					op.rowid = parts2[2];
				}
			}

		} else {
			// find by value
			let r = new RegExp(`^(repeating_${op.section})_([^_]*)_${op.attr}$`,'i');

			let attr = findObjs({
				type: 'attribute',
				characterid: c.id
			})
			.find(a=>r.test(a.get('name')) && ( keyFormat(a.get('current')).indexOf(keyFormat(op.value)) !== -1 || keyFormat(a.get('max')).indexOf(op.value) !== -1) );

			if(attr) {
				let parts = attr.get('name').match(r);
				op.rowid = parts[2];
			}
		}

		return op;
	};
	
	const simpleObj = (o) => JSON.parse(JSON.stringify(o));

	const doActionLog = (srcC,op) => {
	    let result =[];
		let r = new RegExp(`^repeating_${op.section}_${op.rowid}_`,'i');
		
		let attrs = findObjs({
			type: 'attribute',
			characterid: srcC.id
		}).filter(a=>r.test(a.get('name')));
		

        let rowid = generateRowID();
		attrs.forEach(a=>{
			let a2 = simpleObj(a);
			
			result.push(`Attribute: ` + a2.name.replace("repeating_" + op.section+"_"+op.rowid+"_", '') + `, Value: ` + a2.current + `, Max Value: ` + a2.max);
		});
		
		return result;
	};
	
	
	// !repeat-info --src|name frag of char --attr|section|key|value --attr|section|index
	on('chat:message', msg=>{
		if('api'==msg.type && /^!repeat-info(\b\s|$)/i.test(msg.content) && playerIsGM(msg.playerid)){
			let who = (getObj('player',msg.playerid)||{get:()=>'API'}).get('_displayname');
			let args = msg.content.split(/\s+--/);

			let srcChar;
			let attrOps=[];

            let notes =[];

			args.slice(1).forEach(a=>{
				let cmd = a.split(/\|/);
				switch(cmd[0].toLowerCase()){
					case 'attr':
						switch(cmd.length){
							case 3:
								attrOps.push({
									section: cmd[1],
									index: parseInt(cmd[2])||1
								});
								break;
							case 4:
								attrOps.push({
									section: cmd[1],
									attr: cmd[2],
									value: cmd.slice(3).join('|').toLowerCase()
								});
								break;
						}
						break;

					case 'src':
						srcChar = cmd.slice(1).join('|');
						break;
						
                    default:
                      notes.push(`Don't know how to handle: <code>--${a}</code>`);
				}
			});



			if(!srcChar || ( 0 === (attrOps.length))){
                if(!srcChar){
                  notes.push(`No source character specified (use <code>--src|CHARACTER</code>).`);
                }
                if( 0 === attrOps.length){
                  notes.push(`No attributes specified (use <code>--attr|SECION|KEY|VALUE</code> or <code>--attr|SECION|INDEX</code>).`);
                }
              
				sendChat('',`/w "${who}" <div><ul>${notes.map(n=>`<li>${n}</li>`).join('')}</ul></div><div>Use one of: <ul><li><code>!repeat-info--src|CHARACTER --attr|SECTION|KEY|VALUE </code></li><li><code>!repeat-info --src|CHARACTER --attr|SECTION|NUMBER </code></li></ul></div>`);
				return;
			}

			// find src char
			let cpSrc = getCharsForFragments(srcChar)[0];
			if(!cpSrc) {
				sendChat('',`/w "${who}" <div>Cannot find source Character for: <code>${srcChar}</code></div>`);
				return;
			}

			// find rowids
			let rowIds = attrOps.map((op)=>getRowIdsForOps(cpSrc,op));
            rowIds.forEach(o=>{
              if( ! o.hasOwnProperty('rowid') ){
                notes.push(`Failed to find a match for <code>--attr|${o.section}|${ o.hasOwnProperty('index') ? `${o.index}` : `${o.attr}|${o.value}`}</code>.`);
              }
            });
            if(notes.length){
				sendChat('',`/w "${who}" <div><ul>${notes.map(n=>`<li>${n}</li>`).join('')}</ul></div>`);
            }

			// do action copies
			//rowIds.forEach(row => log(row));
			sendChat('',`/w "${who}" <div><h4>Repeating Row Found, see API Log.</h4></div>`);
			rowIds.forEach(row =>{
			    var result = doActionLog(cpSrc, row).map(n=>`${n}\n`).join('');
			    log(`Repeating Row Found! Section: ${attrOps[0].section}, RecordIndex: ${attrOps[0].index} Record Attr|Value: ${attrOps[0].attr}|${attrOps[0].value} Attributes:`);
			    log(result.replace(/\"/g, "")); 
			});
			
		}
	});

});
