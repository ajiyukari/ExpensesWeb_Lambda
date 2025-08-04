let AWS = require("aws-sdk");

const docClient = new AWS.DynamoDB.DocumentClient();
let date = new Date();
let now = date.toISOString().split("T")[0];

exports.handler = async (event) => {
    //テーブル名
    const TableName = "ExpensesDB";
    //パラメーター
    let params;
    let id = event.id;
    let price = Number(event.Price);
    let name = event.Name;
    let memo = event.Memo;
    let usedDate = event.UsedDate;
    let category = event.Category;
    let userId = event.UserId;
    //レスポンス
    let response;
    //GETするJSON
    let resultJSON;
    //itemsを定義。なかったらナシ
    let items = "検索結果なし";
    
    switch (event.flag){
        //全検索
        case "scan":
            try {
                //ログインユーザーで絞り込み
                params = {
                    TableName : TableName,
                    FilterExpression : "UserId = :id",
                    ExpressionAttributeValues : {":id" : userId}
                };
                resultJSON = await docClient.scan(params).promise();
            }
            catch (e) {
                resultJSON = e;
            }
            //filterは配列のメソッドなので変換
            items = Array.from(resultJSON.Items);
        break;
        
        //検索
        case "search":
            //ログインユーザーで絞り込み
            params = {
                TableName : TableName,
                FilterExpression : "UserId = :id",
                ExpressionAttributeValues : {":id" : userId}
            };
            let allItems = await docClient.scan(params).promise();
            
            //filterは配列のメソッドなので変換
            items  = Array.from(allItems.Items);
            
            //検索内容
            let searchWord = event.searchWord;
            let searchCategory = event.searchCategory;
            let startDate = event.startDate;
            let endDate = event.endDate;
            console.log("検索名："+ searchWord + "カテゴリ："+ searchCategory +"開始日："+ startDate+"終了日："+ endDate);
            console.log("id:"+ userId);
            
            //日付検索
            if(startDate != ""){
                items = items.filter(val => val.UsedDate >= startDate);
            }
            if(endDate != ""){
                items = items.filter(val => val.UsedDate <= endDate);
            }
            if(searchCategory != ""){
                items = items.filter(val => val.Category.includes(searchCategory));
            }
            if(searchWord != ""){
                items = items.filter(val => val.Name.includes(searchWord) || val.Memo.includes(searchWord));
            }
            console.log(items);
        break;
        
        //登録
        case "input":
            //自動採番関数呼び出し+新しい数を直に抽出(Promiceを返す)
            let newSeq = await sequence(TableName);
            //Number型へ変換
            let newid = Number(newSeq.data);
            console.log("【newSeq】" + newid);
            
            resultJSON = await docClient.put({
                TableName: TableName,
                Item: {
                    "ID": newid,
                    "Price":price,
                    "Name":name,
                    "Memo": memo,
                    "UsedDate": usedDate,
                    "Category": category,
                    "LatestUpdatingTime": now,
                    "UserId":userId
                }
            }).promise();
            items = "登録されました：" + JSON.stringify(resultJSON);
            
        break;
        
        //編集（表示）
        case "edit":
            if(event.id != null){
                //ID検索（編集とか）
                console.log("ID検索【ID】" + event.id);
                params = {
                    TableName : TableName,
                    KeyConditionExpression: "ID = :id",
                    ExpressionAttributeValues: {
                    ":id": event.id
                    }
                };
                try {
                resultJSON = await docClient.query(params).promise();
                }
                catch (e) {
                    resultJSON = e;
                }
            }
            items = resultJSON.Items;
        break;
        
        //更新
        case "update":
            console.log("ID:" + id);
            await docClient.update({
                TableName: TableName,
                //Key=パーティションキー、ソートキー
                Key:{
                    "ID": id,
                    "Category": category
                },
                 // 属性は#から、値は:から始まるバインド変数
                UpdateExpression: "set #N = :n, #P = :p, #M = :m, #UD = :ud, #L = :l, #UI = :ui",   
                // カラム名
                ExpressionAttributeNames: {
                    "#N": "Name",
                    "#P": "Price",
                    "#M": "Memo",
                    "#UD": "UsedDate",
                    "#L": "LatestUpdatingTime",
                    "#UI": "UserId"
                }, 
                // 値
                ExpressionAttributeValues: {
                    ":n": name,
                    ":p": price,
                    ":m": memo,
                    ":ud": usedDate,
                    ":l": now,
                    ":ui":userId
                }
            }).promise();
            items = "正常に更新されました";
        break;
        
        //削除
        case "delete":
            console.log("削除ID:" + id + "カテゴリ:"+category);
            await docClient.delete({
                TableName: TableName,
                //Key=パーティションキー、ソートキー
                Key:{
                    "ID": id,
                    "Category": category
                }
            }).promise();
                
            items = "正常に削除されました";
        break;
    }
    
    //responseのbodyに反映
    response = {
        statusCode: 200,
        body: items
    };
    
    return response;
        
};

//自動採番(sequenceテーブルの更新)
function sequence(sequenceName) {
    const params = {
        TableName: "sequence",
        Key: {
            tablename: sequenceName
        },
        UpdateExpression: "set seq = seq + :val",
        ExpressionAttributeValues: {
            ":val":1
        },
        ReturnValues: "UPDATED_NEW"
    };
    
    return new Promise((resolve, reject) => {
        docClient.update(params, function(err, data) {
            let seq;
            if (err) {
                console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                seq = data.Attributes.seq;
                console.log("【自動採番】ID:" + seq);
                resolve({data: seq});
            }
        });
    });
}
